import React from "react";
import { createRoot } from "react-dom/client";
import VoiceConversation from "../src/components/VoiceConversation.jsx";
createRoot(document.getElementById("root")).render(<VoiceConversation sessionId={123} speechEnabled={false} />);
