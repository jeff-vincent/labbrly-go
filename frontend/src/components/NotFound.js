import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
  <div className="min-h-screen flex items-center justify-center bg-white dark:bg-cp-bg transition-colors">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h1 className="text-9xl font-bold bg-gradient-to-r from-blue-600 to-green-500 bg-clip-text text-transparent">404</h1>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Page not found
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sorry, we couldn't find the page you're looking for.
          </p>
        </div>
        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:ring-offset-2 transition duration-150 ease-in-out"
          >
            Go back home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
