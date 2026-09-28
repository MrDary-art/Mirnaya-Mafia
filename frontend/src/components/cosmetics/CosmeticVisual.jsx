import { useEffect, useId, useState } from "react";
import "./cosmetics.css";
import { StarAmount } from "../Icon.jsx";

const ANIMALS = [
  { name: "Сова", body: "#a77d62", face: "#ddbd91", ear: "tuft", accent: "#e4b85d" },
  { name: "Лис", body: "#b86440", face: "#f1c99d", ear: "point", accent: "#f4d7b3" },
  { name: "Медведь", body: "#746354", face: "#d5b89a", ear: "round", accent: "#b9926c" },
  { name: "Волк", body: "#718391", face: "#d3d9d4", ear: "point", accent: "#a3b4b9" },
  { name: "Кот", body: "#a59682", face: "#e9d8c0", ear: "point", accent: "#d3b8a0" },
  { name: "Заяц", body: "#b8a58c", face: "#eadbca", ear: "long", accent: "#dfb4b5" },
  { name: "Олень", body: "#a57457", face: "#edcfaa", ear: "antler", accent: "#d8b68a" },
  { name: "Панда", body: "#eff0e6", face: "#f7f3e9", ear: "round", accent: "#333e43" },
  { name: "Тигр", body: "#d99445", face: "#f0c777", ear: "point", accent: "#71462d" },
  { name: "Коала", body: "#89999a", face: "#c7d0ca", ear: "round", accent: "#617879" },
  { name: "Выдра", body: "#806a58", face: "#d2ad87", ear: "round", accent: "#a5866a" },
  { name: "Енот", body: "#8b8d82", face: "#c7c5ae", ear: "point", accent: "#50595b" },
  { name: "Лев", body: "#d3984f", face: "#f4d5a2", ear: "round", accent: "#8e5539", feature: "lion" },
  { name: "Жираф", body: "#dca75d", face: "#f9ddb0", ear: "none", accent: "#9b6341", feature: "giraffe" },
  { name: "Зебра", body: "#e8e5dd", face: "#faf7ef", ear: "point", accent: "#3f4650", feature: "zebra" },
  { name: "Пингвин", body: "#202e3c", face: "#f1eee3", ear: "none", accent: "#efa549", feature: "penguin" },
  { name: "Слон", body: "#7b93a5", face: "#a8bac1", ear: "none", accent: "#5b7180", feature: "elephant" },
  { name: "Ёж", body: "#88674e", face: "#e7c49e", ear: "none", accent: "#4b382e", feature: "hedgehog" },
  { name: "Черепаха", body: "#608761", face: "#a9c28b", ear: "none", accent: "#3e6349", feature: "turtle" },
  { name: "Лягушка", body: "#79ac65", face: "#a8d980", ear: "none", accent: "#4c7b51", feature: "frog" },
  { name: "Лама", body: "#c9b494", face: "#f4e5c9", ear: "long", accent: "#927e64", feature: "llama" },
  { name: "Крокодил", body: "#64865a", face: "#9ebc7e", ear: "none", accent: "#36583e", feature: "crocodile" },
  { name: "Кабан", body: "#997061", face: "#d4a999", ear: "point", accent: "#704c45", feature: "boar" },
  { name: "Тукан", body: "#242f38", face: "#e6e5d3", ear: "none", accent: "#eab248", feature: "toucan" },
];
const AVATAR_CODES = [
  "avatar_analyst", "avatar_diplomat", "avatar_manager", "avatar_researcher", "avatar_mediator", "avatar_beginner",
  "avatar_hr", "avatar_sales", "avatar_negotiator", "avatar_deal", "avatar_speaker", "avatar_consultant",
  "avatar_observer", "avatar_partner", "avatar_practitioner", "avatar_argument", "avatar_market", "avatar_alternative",
  "avatar_trust", "avatar_sales_leader", "avatar_master", "avatar_calm", "avatar_trust_master", "avatar_goal_master",
];
export const animalForCode = (code) => {
  const known = AVATAR_CODES.indexOf(code);
  const index = known >= 0 ? known : [...(code || "")].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % ANIMALS.length;
  return ANIMALS[index];
};
export const cosmeticCategories = [
  ["avatar", "Аватары"], ["frame", "Рамки"], ["status", "Статусы"], ["theme", "Фоны"], ["badge", "Значки"],
];

const statusNames = {
  status_online: "На связи", status_listening: "Слушаю внимательно", status_dialogue: "Открыт к диалогу",
  status_questions: "Задаю вопросы", status_balance: "Ищу баланс", status_calm: "Спокойный тон",
  status_solution: "В поиске решения", status_negotiating: "За столом переговоров",
};
export const statusLabel = (code) => statusNames[code] || "";

function SpecialAnimalArt({ animal, id }) {
  const kind = animal.feature;
  return <svg className="cosmetic-animal" viewBox="0 0 100 100" aria-hidden="true" focusable="false" data-animal={animal.name}>
    <defs><linearGradient id={`animal-${id}`} x2="1" y2="1"><stop stopColor="#33494d" /><stop offset="1" stopColor="#142329" /></linearGradient></defs>
    <rect width="100" height="100" fill={`url(#animal-${id})`} />
    <circle cx="50" cy="105" r="38" fill={animal.body} />
    {kind === "lion" && <><circle cx="50" cy="48" r="39" fill={animal.accent} /><circle cx="19" cy="38" r="11" fill={animal.accent} /><circle cx="81" cy="38" r="11" fill={animal.accent} /><circle cx="50" cy="15" r="11" fill={animal.accent} /><circle cx="26" cy="74" r="11" fill={animal.accent} /><circle cx="74" cy="74" r="11" fill={animal.accent} /><circle cx="23" cy="34" r="9" fill={animal.body} /><circle cx="77" cy="34" r="9" fill={animal.body} /><ellipse cx="50" cy="53" rx="27" ry="30" fill={animal.face} /><ellipse cx="40" cy="49" rx="4" ry="5" fill="#392d29" /><ellipse cx="60" cy="49" rx="4" ry="5" fill="#392d29" /><path d="M43 63 50 69 57 63Z" fill="#6f4635" /><path d="M50 69q-6 9-12 3m12-3q6 9 12 3" fill="none" stroke="#6f4635" strokeWidth="2" strokeLinecap="round" /></>}
    {kind === "giraffe" && <><path d="M35 76V16m30 60V16" stroke={animal.body} strokeWidth="23" /><path d="M38 24 34 9m28 15 4-15" stroke={animal.accent} strokeWidth="5" strokeLinecap="round" /><circle cx="33" cy="9" r="5" fill={animal.accent} /><circle cx="67" cy="9" r="5" fill={animal.accent} /><ellipse cx="23" cy="34" rx="13" ry="7" fill={animal.body} /><ellipse cx="77" cy="34" rx="13" ry="7" fill={animal.body} /><ellipse cx="50" cy="49" rx="27" ry="34" fill={animal.body} /><path d="M32 34q8-8 12-1m22 3q-6-10-12-3M25 59l9 4m41-4-9 4" stroke={animal.accent} strokeWidth="6" strokeLinecap="round" /><ellipse cx="50" cy="68" rx="21" ry="15" fill={animal.face} /><circle cx="40" cy="49" r="3.5" fill="#47372e" /><circle cx="60" cy="49" r="3.5" fill="#47372e" /><circle cx="43" cy="67" r="2.5" fill={animal.accent} /><circle cx="57" cy="67" r="2.5" fill={animal.accent} /><path d="M43 76q7 5 14 0" fill="none" stroke={animal.accent} strokeWidth="2" /></>}
    {kind === "zebra" && <><path d="M18 42 22 10 43 31M82 42 78 10 57 31" fill={animal.body} /><ellipse cx="50" cy="52" rx="34" ry="37" fill={animal.face} /><path d="M37 18 44 42 35 37m28-19-7 24 9-5M26 38l17 12m31-12L57 50M20 58l19 3m41-3-19 3" fill="none" stroke={animal.accent} strokeWidth="6" strokeLinecap="round" /><ellipse cx="50" cy="71" rx="18" ry="15" fill="#d5d3cd" /><circle cx="39" cy="51" r="3.5" fill={animal.accent} /><circle cx="61" cy="51" r="3.5" fill={animal.accent} /><ellipse cx="50" cy="69" rx="6" ry="4" fill={animal.accent} /></>}
    {kind === "penguin" && <><path d="M18 52q-13 9-11 33l23-13m52-20q13 9 11 33L70 72" fill={animal.body} /><ellipse cx="50" cy="53" rx="35" ry="43" fill={animal.body} /><ellipse cx="50" cy="69" rx="25" ry="27" fill={animal.face} /><ellipse cx="36" cy="45" rx="14" ry="20" fill={animal.face} /><ellipse cx="64" cy="45" rx="14" ry="20" fill={animal.face} /><circle cx="38" cy="47" r="4" fill="#1a2730" /><circle cx="62" cy="47" r="4" fill="#1a2730" /><path d="M38 59 50 67 62 59 50 55Z" fill={animal.accent} /><path d="M33 93h13m8 0h13" stroke={animal.accent} strokeWidth="5" strokeLinecap="round" /></>}
    {kind === "elephant" && <><ellipse cx="20" cy="50" rx="18" ry="27" fill={animal.body} /><ellipse cx="80" cy="50" rx="18" ry="27" fill={animal.body} /><ellipse cx="19" cy="50" rx="11" ry="18" fill={animal.face} /><ellipse cx="81" cy="50" rx="11" ry="18" fill={animal.face} /><ellipse cx="50" cy="49" rx="32" ry="35" fill={animal.body} /><circle cx="39" cy="47" r="3.5" fill="#263845" /><circle cx="61" cy="47" r="3.5" fill="#263845" /><path d="M42 63q-5 13-10 13m26-13q5 13 10 13" fill="none" stroke="#f4eee2" strokeWidth="5" strokeLinecap="round" /><path d="M50 60q12 22 0 31-6 4-11-2" fill="none" stroke={animal.body} strokeWidth="18" strokeLinecap="round" /><path d="M50 60q12 22 0 31-6 4-11-2" fill="none" stroke={animal.face} strokeWidth="12" strokeLinecap="round" /></>}
    {kind === "hedgehog" && <><path d="M13 61 5 44l14 2-5-19 16 7 3-20 17 13 17-13 3 20 16-7-5 19 14-2-8 17Z" fill={animal.accent} /><ellipse cx="50" cy="60" rx="34" ry="31" fill={animal.face} /><path d="M20 48 10 40m17-2-8-13m19 7-4-17m16 13V11m12 21 4-17m7 23 8-13m-1 23 10-8" stroke="#bb9066" strokeWidth="5" strokeLinecap="round" /><ellipse cx="37" cy="54" rx="4" ry="5" fill="#302c2a" /><ellipse cx="63" cy="54" rx="4" ry="5" fill="#302c2a" /><ellipse cx="50" cy="71" rx="9" ry="7" fill="#3a302e" /><path d="M34 75q-7 2-11 0m43 0q7 2 11 0" stroke={animal.accent} strokeWidth="2" strokeLinecap="round" /></>}
    {kind === "turtle" && <><ellipse cx="50" cy="78" rx="44" ry="29" fill={animal.accent} /><path d="M21 80 37 63 50 75l13-12 16 17M37 63l-3 26m29-26 3 26M50 75v24" fill="none" stroke="#88ac7c" strokeWidth="4" /><circle cx="50" cy="42" r="27" fill={animal.face} /><circle cx="40" cy="40" r="4" fill="#2d4b39" /><circle cx="60" cy="40" r="4" fill="#2d4b39" /><path d="M40 55q10 9 20 0" fill="none" stroke="#4c7654" strokeWidth="3" strokeLinecap="round" /><ellipse cx="14" cy="82" rx="10" ry="7" fill={animal.body} /><ellipse cx="86" cy="82" rx="10" ry="7" fill={animal.body} /></>}
    {kind === "frog" && <><ellipse cx="50" cy="58" rx="39" ry="30" fill={animal.body} /><circle cx="30" cy="29" r="15" fill={animal.body} /><circle cx="70" cy="29" r="15" fill={animal.body} /><circle cx="30" cy="29" r="9" fill={animal.face} /><circle cx="70" cy="29" r="9" fill={animal.face} /><circle cx="30" cy="29" r="4" fill="#253d2e" /><circle cx="70" cy="29" r="4" fill="#253d2e" /><circle cx="41" cy="55" r="2" fill={animal.accent} /><circle cx="59" cy="55" r="2" fill={animal.accent} /><path d="M29 68q21 19 42 0" fill="none" stroke={animal.accent} strokeWidth="4" strokeLinecap="round" /></>}
    {kind === "llama" && <><path d="M35 101V39h30v62" fill={animal.body} /><path d="M26 41 22 8l16 22m36 11 4-33-16 22" fill={animal.body} /><ellipse cx="50" cy="43" rx="27" ry="32" fill={animal.face} /><path d="M30 25q5-17 12-5 7-18 15-3 8-7 14 8" fill={animal.body} /><circle cx="39" cy="43" r="3.5" fill="#493f36" /><circle cx="61" cy="43" r="3.5" fill="#493f36" /><ellipse cx="50" cy="59" rx="16" ry="12" fill="#e8d3b4" /><path d="M46 58h8l-4 5Zm4 5q-5 8-10 3m10-3q5 8 10 3" fill="none" stroke={animal.accent} strokeWidth="2" strokeLinecap="round" /></>}
    {kind === "crocodile" && <><path d="M18 39 24 21l8 11 8-18 10 15 10-15 8 18 8-11 6 18" fill={animal.accent} /><ellipse cx="50" cy="53" rx="36" ry="34" fill={animal.body} /><circle cx="35" cy="44" r="9" fill={animal.face} /><circle cx="65" cy="44" r="9" fill={animal.face} /><circle cx="35" cy="43" r="3.5" fill="#243b2a" /><circle cx="65" cy="43" r="3.5" fill="#243b2a" /><path d="M15 58q35-10 70 0l5 21q-40 23-80 0Z" fill={animal.face} /><circle cx="33" cy="65" r="3" fill={animal.accent} /><circle cx="67" cy="65" r="3" fill={animal.accent} /><path d="M18 78 27 86l6-4 6 6 6-5 6 7 6-7 6 5 6-6 6 4 9-8" fill="none" stroke="#f7f1dc" strokeWidth="4" strokeLinejoin="round" /></>}
    {kind === "boar" && <><path d="M17 45 15 15 39 34m44 11 2-30-24 19" fill={animal.body} /><path d="M21 30 20 21 31 33m48-3 1-9-11 12" fill={animal.face} /><ellipse cx="50" cy="54" rx="35" ry="36" fill={animal.body} /><path d="M34 34q-9 13-3 20m38-20q9 13 3 20" fill="none" stroke={animal.accent} strokeWidth="6" strokeLinecap="round" /><circle cx="37" cy="49" r="4" fill="#352d2b" /><circle cx="63" cy="49" r="4" fill="#352d2b" /><path d="M32 67 21 77l15-2m32-8 11 10-15-2" fill="#f4ead8" /><ellipse cx="50" cy="72" rx="19" ry="13" fill={animal.face} /><circle cx="43" cy="72" r="4" fill={animal.accent} /><circle cx="57" cy="72" r="4" fill={animal.accent} /></>}
    {kind === "toucan" && <><ellipse cx="42" cy="60" rx="30" ry="39" fill={animal.body} /><path d="M23 35q16-35 43-16l-4 40-37 10Z" fill={animal.body} /><ellipse cx="45" cy="64" rx="19" ry="26" fill={animal.face} /><circle cx="49" cy="38" r="5" fill="#f8f5e9" /><circle cx="50" cy="38" r="2.5" fill="#19262d" /><path d="M55 45q34-18 39 4-16 23-42 17Z" fill={animal.accent} /><path d="M58 61q19 0 35-12" fill="none" stroke="#ca7349" strokeWidth="4" /><path d="M39 90v9m16-9v9" stroke={animal.accent} strokeWidth="4" strokeLinecap="round" /></>}
  </svg>;
}

function AnimalArt({ code }) {
  const animal = animalForCode(code);
  const id = useId().replaceAll(":", "");
  if (animal.feature) return <SpecialAnimalArt animal={animal} id={id} />;
  const variant = ANIMALS.indexOf(animal);
  return <svg className="cosmetic-animal" viewBox="0 0 100 100" aria-hidden="true" focusable="false" data-animal={animal.name}>
    <defs><linearGradient id={`animal-${id}`} x2="1" y2="1"><stop stopColor="#33494d" /><stop offset="1" stopColor="#142329" /></linearGradient></defs>
    <rect width="100" height="100" fill={`url(#animal-${id})`} />
    <circle cx="50" cy="101" r="35" fill={animal.body} opacity=".9" />
    {animal.ear === "point" && <><path d="M16 45 20 9 42 28ZM84 45 80 9 58 28Z" fill={animal.body} /><path d="M23 31 24 19 34 30ZM77 31 76 19 66 30Z" fill={animal.accent} /></>}
    {animal.ear === "tuft" && <><path d="M17 47 13 13 41 28ZM83 47 87 13 59 28Z" fill={animal.body} /><path d="M17 28 11 15M83 28 89 15" stroke={animal.accent} strokeWidth="3" /></>}
    {animal.ear === "round" && <><circle cx="23" cy="34" r="13" fill={animal.body} /><circle cx="77" cy="34" r="13" fill={animal.body} /><circle cx="23" cy="34" r="7" fill={animal.accent} /><circle cx="77" cy="34" r="7" fill={animal.accent} /></>}
    {animal.ear === "long" && <><ellipse cx="31" cy="21" rx="9" ry="24" transform="rotate(-12 31 21)" fill={animal.body} /><ellipse cx="69" cy="21" rx="9" ry="24" transform="rotate(12 69 21)" fill={animal.body} /><ellipse cx="31" cy="21" rx="4" ry="17" transform="rotate(-12 31 21)" fill={animal.accent} /><ellipse cx="69" cy="21" rx="4" ry="17" transform="rotate(12 69 21)" fill={animal.accent} /></>}
    {animal.ear === "antler" && <><path d="M28 31 23 12 14 8M23 19 31 11M72 31 77 12 86 8M77 19 69 11" fill="none" stroke="#b99a74" strokeWidth="5" strokeLinecap="round" /><ellipse cx="22" cy="36" rx="11" ry="7" fill={animal.body} /><ellipse cx="78" cy="36" rx="11" ry="7" fill={animal.body} /></>}
    <ellipse cx="50" cy="54" rx="34" ry="36" fill={animal.body} />
    <ellipse cx="50" cy="63" rx="25" ry="23" fill={animal.face} />
    {variant === 7 && <><ellipse cx="36" cy="49" rx="11" ry="15" fill="#414a4b" /><ellipse cx="64" cy="49" rx="11" ry="15" fill="#414a4b" /></>}
    {variant === 11 && <path d="M24 45 Q50 35 76 45 L73 58 Q50 47 27 58Z" fill="#50595b" />}
    {variant === 8 && <><path d="M38 29 42 39M50 27 50 38M62 29 58 39M21 52 30 55M79 52 70 55" stroke="#744a2d" strokeWidth="4" strokeLinecap="round" /></>}
    {variant === 0 ? <><circle cx="36" cy="50" r="12" fill="#eed4a4" /><circle cx="64" cy="50" r="12" fill="#eed4a4" /><circle cx="36" cy="50" r="5" fill="#17272b" /><circle cx="64" cy="50" r="5" fill="#17272b" /><path d="M45 61 50 70 55 61Z" fill={animal.accent} /></> : <><ellipse cx="37" cy="51" rx="4" ry="5" fill="#17272b" /><ellipse cx="63" cy="51" rx="4" ry="5" fill="#17272b" /><ellipse cx="50" cy="67" rx={variant === 9 ? "9" : "6"} ry="5" fill={variant === 9 ? "#52666a" : "#3b3733"} /><path d="M50 71 Q44 78 38 73M50 71 Q56 78 62 73" fill="none" stroke="#544d46" strokeWidth="2" strokeLinecap="round" /></>}
    {(variant === 4 || variant === 10) && <path d="M28 65 13 60m15 9-16 1m60-5 15-5m-15 9 16 1" fill="none" stroke={variant === 4 ? "#9e8572" : "#775d4d"} strokeWidth="2" strokeLinecap="round" />}
    {variant === 3 && <path d="m23 64-10 6 13 3m51-9 10 6-13 3" fill={animal.face} />}
    {variant === 9 && <><circle cx="21" cy="34" r="9" fill="#d8ded8" opacity=".72" /><circle cx="79" cy="34" r="9" fill="#d8ded8" opacity=".72" /></>}
    <circle cx="28" cy="61" r="3" fill="#fff" opacity=".08" /><circle cx="72" cy="61" r="3" fill="#fff" opacity=".08" />
  </svg>;
}

function FrameArt({ code }) {
  const index = ["frame_classic", "frame_minimal", "frame_violet", "frame_cyber", "frame_emerald", "frame_electric", "frame_executive", "frame_neon", "frame_ice", "frame_gold", "frame_diplomat", "frame_grandmaster", "frame_prism"].indexOf(code);
  const palette = ["#a9c4b5", "#9baeb0", "#b9a3dc", "#79cbd0", "#8ed9ae", "#b0d6ff", "#d4c4a0", "#9ee7d7", "#c6e6ee", "#e9ca83", "#b9d2bd", "#e3c38c", "#bea9e0"];
  const color = palette[Math.max(0, index)];
  return <svg className="cosmetic-frame" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <rect x="3" y="3" width="94" height="94" rx="22" fill="none" stroke={color} strokeWidth={index === 6 ? "5" : "3.5"} />
    {index === 0 && <rect x="8" y="8" width="84" height="84" rx="18" fill="none" stroke={color} strokeOpacity=".48" strokeWidth="1.8" />}
    {index === 1 && <path d="M20 7H80M20 93H80M7 20V80M93 20V80" fill="none" stroke={color} strokeOpacity=".68" strokeWidth="2" strokeLinecap="round" />}
    {index === 2 && <><rect x="8" y="8" width="84" height="84" rx="18" fill="none" stroke={color} strokeOpacity=".42" strokeWidth="2" /><path d="M16 12h16M68 12h16M16 88h16M68 88h16" stroke={color} strokeWidth="3" strokeLinecap="round" /></>}
    {index === 3 && <path d="M19 4v12l-8 8M81 4v12l8 8M19 96V84l-8-8M81 96V84l8-8M4 19h12M84 19h12M4 81h12M84 81h12" fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />}
    {index === 4 && <path d="M28 8c-8 2-11 8-14 16M72 8c8 2 11 8 14 16M28 92c-8-2-11-8-14-16M72 92c8-2 11-8 14-16M8 31v38M92 31v38" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />}
    {index === 5 && <><rect x="8" y="8" width="84" height="84" rx="18" fill="none" stroke={color} strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="8 5" /><path d="M50 1 54 9 50 17 46 9ZM50 83l4 8-4 8-4-8ZM1 50l8-4 8 4-8 4ZM83 50l8-4 8 4-8 4Z" fill={color} /></>}
    {index === 6 && <path d="M24 3h52M24 97h52M3 24v52M97 24v52M13 13h15M72 13h15M13 87h15M72 87h15" fill="none" stroke={color} strokeWidth="3" strokeLinecap="square" />}
    {index === 7 && <><rect x="7" y="7" width="86" height="86" rx="19" fill="none" stroke={color} strokeOpacity=".42" strokeWidth="2" /><rect x="12" y="12" width="76" height="76" rx="15" fill="none" stroke={color} strokeWidth="2" strokeDasharray="14 6" /></>}
    {index === 8 && <path d="m16 5 9 11-13 4M84 5 75 16l13 4M16 95l9-11-13-4M84 95l-9-11 13-4M8 30h7M85 30h7M8 70h7M85 70h7" fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />}
    {index === 9 && <><rect x="8" y="8" width="84" height="84" rx="18" fill="none" stroke={color} strokeOpacity=".42" strokeWidth="1.5" /><path d="m13 23 9-12 8 7M87 23 78 11l-8 7M13 77l9 12 8-7M87 77 78 89l-8-7" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" /></>}
    {index === 10 && <path d="M4 42h10l5 8-5 8H4M96 42H86l-5 8 5 8h10M29 7v8M71 7v8M29 93v-8M71 93v-8" fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />}
    {index === 11 && <path d="m23 7 7 10 8-8 12 9 12-9 8 8 7-10M23 93l7-10 8 8 12-9 12 9 8-8 7 10M8 31v38M92 31v38" fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />}
    {index === 12 && <><rect x="8" y="8" width="84" height="84" rx="18" fill="none" stroke={color} strokeOpacity=".45" strokeWidth="1.5" /><path d="m23 4 8 15-15 7M77 4 69 19l15 7M23 96l8-15-15-7M77 96l-8-15 15-7" fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" /></>}
  </svg>;
}

export function BadgeArt({ code, size = 24 }) {
  const paths = {
    badge_spark: "M12 2 14 9 21 12 14 15 12 22 10 15 3 12 10 9Z",
    badge_focus: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
    badge_pulse: "M2 12h5l3-6 4 12 3-6h5",
    badge_dialogue: "M4 5h16v12H9l-5 4V5Z",
    badge_vector: "M12 2 21 20 12 16 3 20Z",
    badge_tact: "M12 2 21 7v6c0 5-4 8-9 9-5-1-9-4-9-9V7Z",
    badge_balance: "M12 3v17M4 7h16M5 7l-3 6h6L5 7Zm14 0-3 6h6l-3-6ZM7 21h10",
    badge_rhythm: "M3 14c3-8 6 8 9 0s6 8 9 0",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[code] || paths.badge_spark} /></svg>;
}

export function CosmeticItemArt({ item, equipment = {}, userId }) {
  if (item.category === "avatar") return <UserAvatar avatarCode={item.code} frameCode={equipment.frame_code} userId={userId} size="lg" name={item.name} />;
  if (item.category === "frame") return <UserAvatar avatarCode={equipment.avatar_code} frameCode={item.code} userId={userId} size="lg" name={item.name} />;
  if (item.category === "theme") return <div className={`cosmetic-theme-swatch cosmetic-background-${item.code}`} aria-label={item.name}><span>ПРОФИЛЬ</span><i /></div>;
  if (item.category === "status") return <span className="cosmetic-status-swatch">{statusLabel(item.code)}</span>;
  return <span className="cosmetic-badge-swatch" aria-label={item.name}><BadgeArt code={item.code} size={52} /></span>;
}

export function UserAvatar({ avatarCode = "avatar_analyst", frameCode = "frame_classic", userId, size = "md", name = "Аватар", className = "" }) {
  const [failed, setFailed] = useState(false);
  const [imageVersion, setImageVersion] = useState(0);
  const imageBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  useEffect(() => {
    if (avatarCode !== "avatar_custom" || !userId) return undefined;
    const onChanged = () => { setFailed(false); setImageVersion(Date.now()); };
    window.addEventListener("arena:cosmetics-changed", onChanged);
    return () => window.removeEventListener("arena:cosmetics-changed", onChanged);
  }, [avatarCode, userId]);
  const custom = avatarCode === "avatar_custom" && userId && !failed;
  return <span className={`user-avatar user-avatar--${size} ${className}`} role="img" aria-label={name}>
    {custom ? <img className="user-avatar-image" src={`${imageBase}/api/avatars/${userId}?v=${imageVersion}`} alt="" loading="lazy" onError={() => setFailed(true)} /> : <AnimalArt code={avatarCode === "avatar_custom" ? "avatar_analyst" : avatarCode} />}
    <FrameArt code={frameCode} />
  </span>;
}

export function ProfilePreview({ equipment = {}, username = "Игрок", level = 1, stars = null, userId, isPreview = false, compact = false, details, children }) {

  return <div className={`cosmetic-profile-preview cosmetic-background-${equipment.profile_theme || "theme_arena"}${compact ? " cosmetic-profile-preview--compact" : ""}`}>
    <div className="cosmetic-profile-content">
      <UserAvatar avatarCode={equipment.avatar_code} frameCode={equipment.frame_code} userId={userId} size={compact ? "md" : "xl"} name={`Аватар ${username}`} />
      <div className="cosmetic-profile-copy">{isPreview && <span className="cosmetic-preview-label">Предпросмотр</span>}<strong>{username}</strong><div className="cosmetic-profile-meta"><span>Уровень {level}</span>{stars != null && <StarAmount className="cosmetic-star-balance" value={stars} />}</div>{details}{equipment.status_code && <span className="cosmetic-profile-status">{statusLabel(equipment.status_code)}</span>}{equipment.badge_code && <span className="cosmetic-profile-badge"><BadgeArt code={equipment.badge_code} size={18} /> {badgeLabel(equipment.badge_code)}</span>}</div>
    </div>
    {children}
  </div>;
}

const badgeNames = { badge_spark: "Искра", badge_focus: "Фокус", badge_pulse: "Импульс", badge_dialogue: "Диалог", badge_vector: "Вектор", badge_tact: "Такт", badge_balance: "Баланс", badge_rhythm: "Ритм" };
export const badgeLabel = (code) => badgeNames[code] || "Значок";
