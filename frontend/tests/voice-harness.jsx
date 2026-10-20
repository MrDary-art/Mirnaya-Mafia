import React from "react";
import { createRoot } from "react-dom/client";
import VoiceConversation from "../src/components/VoiceConversation.jsx";
createRoot(document.getElementById("root")).render(<React.StrictMode><VoiceConversation sessionId={123} speechEnabled onTurn={result => { window.voiceTestResult = result; }} onStreamEvent={event => { (window.voiceTestEvents ||= []).push(event); }} /></React.StrictMode>);
