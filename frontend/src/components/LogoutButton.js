import React from "react";
import { useAuth0 } from "@auth0/auth0-react";

const LogoutButton = () => {
  const { logout } = useAuth0();

  return (
    <button 
      onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
      className="px-5 py-2.5 rounded-md font-medium bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-cp-panel dark:text-neutral-200 dark:hover:bg-cp-panel/80 border border-gray-300 dark:border-cp-border focus:outline-none focus:ring-2 focus:ring-cp-blue/30 transition flex items-center gap-2"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
      Log Out
    </button>
  );
};

export default LogoutButton;
