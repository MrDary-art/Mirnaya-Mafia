"""Conservative GPU selection for one live speech worker, not a benchmark."""
import csv
from dataclasses import dataclass
import io
import subprocess


@dataclass(frozen=True)
class GPU:
    uuid: str
    name: str
    total_mib: int
    free_mib: int
    capability: tuple[int, int]


@dataclass(frozen=True)
class Plan:
    gpu: GPU
    model: str
    compute_type: str
    reason: str


def detect_gpus():
    try:
        result = subprocess.run([
            "nvidia-smi", "--query-gpu=uuid,name,memory.total,memory.free,compute_cap",
            "--format=csv,noheader,nounits",
        ], capture_output=True, text=True, check=True, timeout=20)
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        raise RuntimeError("Не удалось опросить NVIDIA GPU. Проверьте nvidia-smi и драйвер; установщик драйвер не меняет.") from None
    devices = []
    try:
        for row in csv.reader(io.StringIO(result.stdout), skipinitialspace=True):
            if not row:
                continue
            uuid, name, total, free, capability = [value.strip() for value in row]
            major, minor = map(int, capability.split("."))
            total, free = int(total), int(free)
            if not uuid.startswith("GPU-") or not 0 <= free <= total:
                raise ValueError()
            devices.append(GPU(uuid, name, total, free, (major, minor)))
    except (ValueError, TypeError):
        raise RuntimeError("nvidia-smi вернул неполные параметры GPU; автоматический выбор отменён.") from None
    if not devices:
        raise RuntimeError("NVIDIA GPU не найдена. AMD, Intel и CPU этим внешним установщиком не поддерживаются.")
    return devices


def plan_for(gpu, profile="realtime", model="auto"):
    if profile not in {"realtime", "quality"} or model not in {"auto", "large-v3-turbo", "large-v3"}:
        raise ValueError("Неизвестный профиль или модель")
    if gpu.capability < (7, 0):
        raise ValueError("Нужна NVIDIA с compute capability 7.0 или выше")
    if model == "auto":
        model = "large-v3" if profile == "quality" and gpu.free_mib >= 12288 else "large-v3-turbo"
    if model == "large-v3":
        if gpu.free_mib < 12288:
            raise ValueError("Для large-v3 требуется минимум 12 ГиБ свободной видеопамяти по политике установщика")
        return Plan(gpu, model, "float16", "Приоритет качества; полная модель и запас видеопамяти")
    if gpu.free_mib >= 6144:
        return Plan(gpu, model, "float16", "Быстрое распознавание для встреч; свободно не менее 6 ГиБ")
    if gpu.free_mib >= 4096:
        return Plan(gpu, model, "int8_float16", "Turbo с квантованием; свободно от 4 до 6 ГиБ")
    raise ValueError("Недостаточно свободной видеопамяти: нужно минимум 4 ГиБ; освободите GPU")


def choose_plan(gpus, profile="realtime", model="auto", gpu_uuid=None):
    if profile not in {"realtime", "quality"} or model not in {"auto", "large-v3-turbo", "large-v3"}:
        raise ValueError("Неизвестный профиль или модель")
    candidates = []
    errors = []
    for gpu in gpus:
        if gpu_uuid and gpu.uuid != gpu_uuid:
            continue
        try:
            candidates.append(plan_for(gpu, profile, model))
        except ValueError as exc:
            errors.append(f"{gpu.name}: {exc}")
    if not candidates:
        raise RuntimeError("Подходящая GPU не найдена. " + "; ".join(errors))
    # Never pool VRAM across GPUs or combine devices into one allocation.
    return max(candidates, key=lambda p: (
        int(p.model == "large-v3"), int(p.compute_type == "float16"),
        p.gpu.free_mib, p.gpu.capability, p.gpu.uuid,
    ))
