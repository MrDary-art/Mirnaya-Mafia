const url = "http://127.0.0.1:3000/api/health";
const deadline = Date.now() + 30_000;
let ready = false;

while (Date.now() < deadline) {
  try {
    const response = await fetch(url);
    await response.arrayBuffer();
    if (response.ok) { ready = true; break; }
  } catch {
    // The API process is still starting.
  }
  await new Promise(resolve => setTimeout(resolve, 200));
}

if (!ready) {
  console.error("API не запустился на 127.0.0.1:3000. Проверьте сообщение процесса api выше.");
  process.exitCode = 1;
}
