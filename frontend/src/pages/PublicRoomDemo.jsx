import { useLayoutEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import GuidedDemo from "./GuidedDemo.jsx";
import "./landing.css";

export default function PublicRoomDemo() {
  const { user } = useAuth();

  useLayoutEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <main className="landing-public-demo">
      <nav className="landing-public-demo-nav" aria-label="Навигация по демонстрации">
        <Link to="/">← На главную</Link>
        <Link to={user ? "/rooms" : "/register?next=%2Frooms"}>Создать встречу</Link>
      </nav>
      <div className="product-page">
        <div className="product-page-body">
          <GuidedDemo />
        </div>
      </div>
    </main>
  );
}
