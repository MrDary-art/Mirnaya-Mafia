import {useEffect} from "react";
import {useLocation} from "react-router-dom";
import {useAuth} from "../auth.jsx";
import {api} from "../api.js";

export default function SupportActivityTracker(){
  const {user}=useAuth(),{pathname}=useLocation();
  useEffect(()=>{if(!user||user.is_admin||pathname.startsWith("/admin")||pathname==="/moderation")return;
    // Never include search parameters, fragments, input values or message content.
    api("/api/support/activity",{method:"POST",body:{path:pathname}}).catch(()=>{});
  },[user?.id,pathname]);
  return null;
}
