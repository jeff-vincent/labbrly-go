import LoginButton from "./LoginButton";
import LogoutButton from "./LogoutButton";
import { useAuth0 } from "@auth0/auth0-react";

const Header = () => {
  const { isAuthenticated } = useAuth0();
  const handleDocs = () => {
    window.open("/docs", "_blank", "noopener,noreferrer");
  };

  return (
    <header className="w-full max-w-6xl mx-auto flex items-center justify-between px-5 py-3 rounded-lg bg-white/60 backdrop-blur-sm border border-gray-200/70 dark:bg-cp-panel/70 dark:border-cp-border">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900 dark:text-neutral-100">
        <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-green-500 bg-clip-text text-transparent">Labbrly</span>
      </h1>
      <nav className="flex items-center gap-2 sm:gap-3 md:gap-4">
        <button
          onClick={handleDocs}
          className="px-4 py-2 rounded-md font-medium text-gray-700 dark:text-neutral-300 hover:text-gray-900 dark:hover:text-neutral-100 focus:outline-none focus:underline transition"
        >
          Docs
        </button>
        {isAuthenticated ? <LogoutButton /> : <LoginButton />}
      </nav>
    </header>
  );
}

export default Header;
