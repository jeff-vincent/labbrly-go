import React, { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from "@auth0/auth0-react";

const SignUp = () => {
  const [formData, setFormData] = useState({
    organization_name: '',
    organization_display_name: '',
    username: '',
    password: '',
    email: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [validationStatus, setValidationStatus] = useState({
    password: { strength: 'weak', message: '', isValid: false },
    organization_name: { checking: false, available: null, message: '' },
    email: { checking: false, available: null, message: '' }
  });

  const { loginWithRedirect, getAccessTokenSilently } = useAuth0();

  // Password strength validation function
  const validatePasswordStrength = (password) => {
    if (!password) return { strength: 'weak', message: '', isValid: false };

    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password);
    const hasRepeatedChars = /(.)\1{2,}/.test(password);
    
    const characterTypes = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
    
    if (hasRepeatedChars) {
      return { 
        strength: 'weak', 
        message: 'Password cannot have more than 2 identical characters in a row', 
        isValid: false 
      };
    }
    
    if (password.length >= 10 && characterTypes >= 3) {
      return { 
        strength: 'excellent', 
        message: 'Excellent password strength', 
        isValid: true 
      };
    } else if (password.length >= 8 && characterTypes >= 2) {
      return { 
        strength: 'good', 
        message: 'Good password strength', 
        isValid: true 
      };
    } else if (password.length >= 6) {
      return { 
        strength: 'fair', 
        message: 'Fair password strength - consider adding more character types', 
        isValid: false 
      };
    } else {
      return { 
        strength: 'weak', 
        message: 'Password is too weak', 
        isValid: false 
      };
    }
  };

  // Debounced organization name check
  const checkOrganizationAvailability = useCallback(
    async (orgName) => {
      if (!orgName) return;
      
      setValidationStatus(prev => ({
        ...prev,
        organization_name: { checking: true, available: null, message: 'Checking availability...' }
      }));

      try {
        const response = await fetch(`/orgs/check-availability`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ organization_name: orgName }),
        }
        );
        const data = await response.json();
        
        if (response.ok) {
          const available = data.available;
          setValidationStatus(prev => ({
            ...prev,
            organization_name: {
              checking: false,
              available,
              message: available ? 'Organization name is available' : 'Organization name is already taken'
            }
          }));
        } else {
          setValidationStatus(prev => ({
            ...prev,
            organization_name: {
              checking: false,
              available: null,
              message: 'Unable to check availability'
            }
          }));
        }
      } catch (error) {
        setValidationStatus(prev => ({
          ...prev,
          organization_name: {
            checking: false,
            available: null,
            message: 'Unable to check availability'
          }
        }));
      }
    },
    []
  );

  // Debounced email check with Auth0
  const checkEmailAvailability = useCallback(
    async (email) => {
      if (!email) return;
      
      setValidationStatus(prev => ({
        ...prev,
        email: { checking: true, available: null, message: 'Checking availability...' }
      }));

      try {
        const response = await fetch(`/auth/check-username`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: email }),
        });
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        
        if (response.ok) {
          const available = data.available;
          setValidationStatus(prev => ({
            ...prev,
            email: {
              checking: false,
              available,
              message: available ? 'Email is available' : 'Email is already taken'
            }
          }));
        } else {
          setValidationStatus(prev => ({
            ...prev,
            email: {
              checking: false,
              available: null,
              message: 'Unable to check availability'
            }
          }));
        }
      } catch (error) {
        setValidationStatus(prev => ({
          ...prev,
          email: {
            checking: false,
            available: null,
            message: 'Unable to check availability'
          }
        }));
      }
    },
    [getAccessTokenSilently]
  );

  // Debounce hooks for real-time validation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.organization_name.length > 0) {
        checkOrganizationAvailability(formData.organization_name);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.organization_name, checkOrganizationAvailability]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.email.length > 0 && /\S+@\S+\.\S+/.test(formData.email)) {
        checkEmailAvailability(formData.email);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.email, checkEmailAvailability]);

  useEffect(() => {
    const passwordValidation = validatePasswordStrength(formData.password);
    setValidationStatus(prev => ({
      ...prev,
      password: passwordValidation
    }));
  }, [formData.password]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.organization_name) {
      newErrors.organization_name = 'Organization name is required';
    } else if (validationStatus.organization_name.available === false) {
      newErrors.organization_name = 'Organization name is already taken';
    }
    
    if (!formData.organization_display_name) {
      newErrors.organization_display_name = 'Organization display name is required';
    }
    
    if (!formData.username) {
      newErrors.username = 'User name is required';
    }
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    } else if (validationStatus.email.available === false) {
      newErrors.email = 'Email is already taken';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (!validationStatus.password.isValid) {
      newErrors.password = validationStatus.password.message || 'Password does not meet requirements';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    
    try {
      const response = await fetch('/orgs/org', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create account');
      }

      loginWithRedirect({
        authorizationParams: {
          organization: data.org_id,
        },
      })
      
    } catch (error) {
      setErrors({ submit: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
  <div className="min-h-screen bg-white dark:bg-cp-bg py-12 px-4 sm:px-6 lg:px-8 transition-colors">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-neutral-100 mb-4">Join Lab Thingy</h1>
          <p className="text-xl text-gray-600 dark:text-neutral-400">Cause, you know, learn people up on your softwares and such.</p>
        </div>

        {/* Sign Up Form */}
  <div className="max-w-md mx-auto bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200 p-8 dark:bg-cp-panel dark:border-cp-border">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-neutral-100">Create Your Free Account</h2>
            </div>
            
            <div>
              <label htmlFor="organization_name" className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2">
                Organization Name
              </label>
              <input
                type="text"
                id="organization_name"
                name="organization_name"
                value={formData.organization_name}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-colors bg-white dark:bg-cp-panel-alt dark:text-neutral-200 ${
                  errors.organization_name 
                    ? 'border-red-500 bg-red-50' 
                    : validationStatus.organization_name.available === true
                    ? 'border-green-500 bg-green-50'
                    : validationStatus.organization_name.available === false
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-300'
                }`}
                required
              />
              {validationStatus.organization_name.checking && (
                <div className="mt-1 flex items-center text-sm text-gray-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
                  {validationStatus.organization_name.message}
                </div>
              )}
              {!validationStatus.organization_name.checking && validationStatus.organization_name.message && (
                <p className={`mt-1 text-sm ${
                  validationStatus.organization_name.available === true 
                    ? 'text-green-600' 
                    : validationStatus.organization_name.available === false 
                    ? 'text-red-600' 
                    : 'text-gray-600'
                }`}>
                  {validationStatus.organization_name.message}
                </p>
              )}
              {errors.organization_name && (
                <p className="mt-1 text-sm text-red-600">{errors.organization_name}</p>
              )}
            </div>

            <div>
              <label htmlFor="organization_display_name" className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2">
                Organization Display Name
              </label>
              <input
                type="text"
                id="organization_display_name"
                name="organization_display_name"
                value={formData.organization_display_name}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-colors bg-white dark:bg-cp-panel-alt dark:text-neutral-200 ${
                  errors.organization_display_name ? 'border-red-500 bg-red-50' : 'border-gray-300'
                }`}
                required
              />
              {errors.organization_display_name && (
                <p className="mt-1 text-sm text-red-600">{errors.organization_display_name}</p>
              )}
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2">
                User Name
              </label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-colors bg-white dark:bg-cp-panel-alt dark:text-neutral-200 ${
                  errors.username ? 'border-red-500 bg-red-50' : 'border-gray-300'
                }`}
                required
              />
              {errors.username && (
                <p className="mt-1 text-sm text-red-600">{errors.username}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-colors bg-white dark:bg-cp-panel-alt dark:text-neutral-200 ${
                  errors.email 
                    ? 'border-red-500 bg-red-50' 
                    : validationStatus.email.available === true
                    ? 'border-green-500 bg-green-50'
                    : validationStatus.email.available === false
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-300'
                }`}
                required
              />
              {validationStatus.email.checking && (
                <div className="mt-1 flex items-center text-sm text-gray-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
                  {validationStatus.email.message}
                </div>
              )}
              {!validationStatus.email.checking && validationStatus.email.message && (
                <p className={`mt-1 text-sm ${
                  validationStatus.email.available === true 
                    ? 'text-green-600' 
                    : validationStatus.email.available === false 
                    ? 'text-red-600' 
                    : 'text-gray-600'
                }`}>
                  {validationStatus.email.message}
                </p>
              )}
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-neutral-300 mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-colors bg-white dark:bg-cp-panel-alt dark:text-neutral-200 ${
                  errors.password 
                    ? 'border-red-500 bg-red-50' 
                    : validationStatus.password.isValid 
                    ? 'border-green-500 bg-green-50'
                    : formData.password.length > 0 
                    ? 'border-yellow-500 bg-yellow-50'
                    : 'border-gray-300'
                }`}
                required
              />
              
              {/* Password Strength Indicator */}
              {formData.password && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 bg-gray-200 dark:bg-cp-border rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          validationStatus.password.strength === 'excellent' 
                            ? 'bg-green-500 w-full' 
                            : validationStatus.password.strength === 'good'
                            ? 'bg-blue-500 w-3/4'
                            : validationStatus.password.strength === 'fair'
                            ? 'bg-yellow-500 w-1/2'
                            : 'bg-red-500 w-1/4'
                        }`}
                      />
                    </div>
                    <span className={`text-sm font-medium ${
                      validationStatus.password.strength === 'excellent' 
                        ? 'text-green-600' 
                        : validationStatus.password.strength === 'good'
                        ? 'text-blue-600'
                        : validationStatus.password.strength === 'fair'
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    }`}>
                      {validationStatus.password.strength.charAt(0).toUpperCase() + validationStatus.password.strength.slice(1)}
                    </span>
                  </div>
                  
                  <div className="text-xs text-gray-600 dark:text-neutral-400 space-y-1">
                    <p>For excellent strength, use at least 10 characters with 3+ of:</p>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <span className={/[a-z]/.test(formData.password) ? 'text-green-600' : 'text-gray-400'}>
                        ✓ Lowercase letter
                      </span>
                      <span className={/[A-Z]/.test(formData.password) ? 'text-green-600' : 'text-gray-400'}>
                        ✓ Uppercase letter
                      </span>
                      <span className={/\d/.test(formData.password) ? 'text-green-600' : 'text-gray-400'}>
                        ✓ Number
                      </span>
                      <span className={/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(formData.password) ? 'text-green-600' : 'text-gray-400'}>
                        ✓ Special character
                      </span>
                    </div>
                    {/(.)\1{2,}/.test(formData.password) && (
                      <p className="text-red-600 text-xs">⚠ No more than 2 identical characters in a row</p>
                    )}
                  </div>
                </div>
              )}
              
              {validationStatus.password.message && (
                <p className={`mt-1 text-sm ${
                  validationStatus.password.isValid ? 'text-green-600' : 'text-red-600'
                }`}>
                  {validationStatus.password.message}
                </p>
              )}
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password}</p>
              )}
            </div>

            {errors.submit && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-600 text-sm">{errors.submit}</p>
              </div>
            )}

            <button 
              type="submit" 
              className="w-full py-4 px-6 rounded-lg font-semibold text-white transition-all duration-300 focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 hover:bg-green-500 focus:ring-green-500/40"
              disabled={loading || 
                        validationStatus.organization_name.checking || 
                        validationStatus.email.checking ||
                        validationStatus.organization_name.available === false ||
                        validationStatus.email.available === false ||
                        !validationStatus.password.isValid}
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Creating Account...
                </div>
              ) : (
                'Create Free Account'
              )}
            </button>

            <div className="text-center space-y-4">
                <p className="text-sm text-gray-600 dark:text-neutral-400">
                By signing up, you agree to our{' '}
                <a href="/terms" target="_blank" className="text-blue-600 hover:text-blue-700 underline">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="/privacy" target="_blank" className="text-blue-600 hover:text-blue-700 underline">
                  Privacy Policy
                </a>.
              </p>

                <p className="text-sm text-gray-600 dark:text-neutral-400">
                Already have an account?{' '}
                <a href="/signin" className="text-blue-600 hover:text-blue-700 font-semibold underline">
                  Sign in
                </a>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
