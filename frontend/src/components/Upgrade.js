import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { useAuth0 } from '@auth0/auth0-react';
import OverageCalculator from './OverageCalculator';
import { useNavigate } from 'react-router-dom';

// Initialize Stripe using env var
const stripePromise = loadStripe('pk_test_51S0sxzQHoQHn9QEv7qQ96qWyI3sdMvoFrgwAazxXMJhIBW3JnCwKiFQ0HbwCI4GhaqqGUbrdjFSHWlOXMQx8zOwY00Nyd2sMJk');

// Backend endpoint expected to create a Stripe Subscription and return details
const SUBSCRIBE_ENDPOINT = '/orgs/subscribe';

const CheckoutForm = ({ selectedPlan }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { getAccessTokenSilently } = useAuth0();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Customer and billing information state
  const [customerInfo, setCustomerInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    address: {
      line1: '',
      line2: '',
      city: '',
      state: '',
      postal_code: '',
      country: 'US'
    }
  });

  const handleInputChange = (field, value) => {
    if (field.startsWith('address.')) {
      const addressField = field.split('.')[1];
      setCustomerInfo(prev => ({
        ...prev,
        address: {
          ...prev.address,
          [addressField]: value
        }
      }));
    } else {
      setCustomerInfo(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const validateForm = () => {
    const required = ['firstName', 'lastName', 'email', 'address.line1', 'address.city', 'address.state', 'address.postal_code'];
    for (const field of required) {
      if (field.startsWith('address.')) {
        const addressField = field.split('.')[1];
        if (!customerInfo.address[addressField]?.trim()) {
          return false;
        }
      } else {
        if (!customerInfo[field]?.trim()) {
          return false;
        }
      }
    }
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!stripe || !elements) {
      setIsLoading(false);
      return;
    }

    if (!validateForm()) {
      setError('Please fill in all required fields.');
      setIsLoading(false);
      return;
    }

    const card = elements.getElement(CardElement);

    const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
      type: 'card',
      card: card,
      billing_details: {
        name: `${customerInfo.firstName} ${customerInfo.lastName}`,
        email: customerInfo.email,
        address: {
          line1: customerInfo.address.line1,
          line2: customerInfo.address.line2,
          city: customerInfo.address.city,
          state: customerInfo.address.state,
          postal_code: customerInfo.address.postal_code,
          country: customerInfo.address.country
        }
      }
    });

    if (stripeError) {
      setError(stripeError.message);
      setIsLoading(false);
      return;
    }

    try {
      // Get Auth0 JWT for authenticated calls
      const token = await getAccessTokenSilently({ audience: process.env.REACT_APP_AUTH0_AUDIENCE });

      // Create subscription on backend (server must use Stripe secret key)
      const subscribeRes = await fetch(SUBSCRIBE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          payment_method_id: paymentMethod.id,
          price_id: selectedPlan.priceId,
          customer: {
            name: `${customerInfo.firstName} ${customerInfo.lastName}`,
            email: customerInfo.email,
            address: customerInfo.address,
            company: customerInfo.company || undefined,
          },
        }),
      });

      if (!subscribeRes.ok) {
        const err = await subscribeRes.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to create subscription');
      }

      const subData = await subscribeRes.json();
      // Normalize expected fields
      const subscription = subData.subscription || subData;

      // 3DS/SCA handling if required
      const latestInvoice = subscription.latest_invoice || subData.latest_invoice;
      const pi = latestInvoice?.payment_intent || subData.payment_intent;
      if (pi?.status === 'requires_action' && pi.client_secret) {
        const { error: confirmError } = await stripe.confirmCardPayment(pi.client_secret);
        if (confirmError) {
          throw new Error(confirmError.message || 'Card authentication failed');
        }
      }

      // // Persist Stripe details on org
      // const updatePayload = {
      //   account_type: 'starter',
      //   stripe_subscription_id: subscription.id,
      //   stripe_customer_id: subscription.customer || subData.customer_id,
      //   stripe_plan: selectedPlan.priceId,
      //   stripe_status: subscription.status || 'active',
      //   // Optionally include generic stripe_id to carry other IDs if backend allows
      //   stripe_id: paymentMethod.id,
      // };

      // const putRes = await fetch('/orgs/org', {
      //   method: 'PUT',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     Authorization: `Bearer ${token}`,
      //   },
      //   body: JSON.stringify(updatePayload),
      // });

      // if (!putRes.ok) {
      //   const err = await putRes.json().catch(() => ({}));
      //   throw new Error(err.detail || err.message || 'Failed to save subscription to org');
      // }

      setSuccess(true);
    } catch (e) {
      setError(e.message || 'An error occurred while upgrading');
    } finally {
      setIsLoading(false);
    }
  };

  const cardStyle = {
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': {
          color: '#aab7c4',
        },
      },
      invalid: {
        color: '#9e2146',
      },
    },
  };

  const countries = [
    { code: 'US', name: 'United States' },
    { code: 'CA', name: 'Canada' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'AU', name: 'Australia' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'IT', name: 'Italy' },
    { code: 'ES', name: 'Spain' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'JP', name: 'Japan' }
  ];

  const usStates = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ];

  if (success) {
    return (
      <div className="text-center py-8">
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          Payment successful! Your {selectedPlan.name} plan upgrade is being processed.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Customer Information */}
  <div className="bg-white/70 dark:bg-cp-panel-alt border border-gray-200 dark:border-cp-border p-6 rounded-lg backdrop-blur-sm">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Customer Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              First Name *
            </label>
            <input
              type="text"
              value={customerInfo.firstName}
              onChange={(e) => handleInputChange('firstName', e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Last Name *
            </label>
            <input
              type="text"
              value={customerInfo.lastName}
              onChange={(e) => handleInputChange('lastName', e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Address *
          </label>
          <input
            type="email"
            value={customerInfo.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Company (Optional)
          </label>
          <input
            type="text"
            value={customerInfo.company}
            onChange={(e) => handleInputChange('company', e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Billing Address */}
  <div className="bg-white/70 dark:bg-cp-panel-alt border border-gray-200 dark:border-cp-border p-6 rounded-lg backdrop-blur-sm">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Billing Address</h3>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Street Address *
          </label>
          <input
            type="text"
            value={customerInfo.address.line1}
            onChange={(e) => handleInputChange('address.line1', e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="123 Main Street"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Apartment, suite, etc. (Optional)
          </label>
          <input
            type="text"
            value={customerInfo.address.line2}
            onChange={(e) => handleInputChange('address.line2', e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Apt 4B"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              City *
            </label>
            <input
              type="text"
              value={customerInfo.address.city}
              onChange={(e) => handleInputChange('address.city', e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              State/Province *
            </label>
            {customerInfo.address.country === 'US' ? (
              <select
                value={customerInfo.address.state}
                onChange={(e) => handleInputChange('address.state', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select State</option>
                {usStates.map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={customerInfo.address.state}
                onChange={(e) => handleInputChange('address.state', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ZIP/Postal Code *
            </label>
            <input
              type="text"
              value={customerInfo.address.postal_code}
              onChange={(e) => handleInputChange('address.postal_code', e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Country *
            </label>
            <select
              value={customerInfo.address.country}
              onChange={(e) => handleInputChange('address.country', e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              {countries.map(country => (
                <option key={country.code} value={country.code}>{country.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Payment Information */}
  <div className="bg-white/70 dark:bg-cp-panel-alt border border-gray-200 dark:border-cp-border p-6 rounded-lg backdrop-blur-sm">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Payment Information</h3>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Card Information *
          </label>
          <div className="p-3 border border-gray-300 rounded-md bg-white">
            <CardElement options={cardStyle} />
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Your card will be charged ${selectedPlan.price} monthly. You can cancel at any time.
          </p>
        </div>

  <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="text-sm">
              <p className="text-green-800 font-medium">Secure Payment</p>
              <p className="text-green-700">
                Your payment information is encrypted and processed securely by Stripe. 
                We never store your card details on our servers.
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || isLoading}
  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? 'Processing...' : `Complete Payment - $${selectedPlan.price}/month`}
      </button>

      <div className="text-center text-sm text-gray-500">
        <p>By completing your purchase, you agree to our Terms of Service and Privacy Policy.</p>
      </div>
    </form>
  );
};

const Upgrade = () => {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const navigate = useNavigate();

  // Mirror PlansInfo tiers (renaming Professional -> Starter for consistency with marketing)
  const pricingTiers = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      priceId: null,
      description: 'Perfect for getting started with lightweight labs.',
      features: [
        'Standard Python, Node.js, and Go Environments',
        'Up to 3 Labs (30 min TTL)',
        'Up to 5 Concurrent Users',
        'Community Support'
      ],
      buttonText: 'Current Plan',
      selectable: false,
      popular: false
    },
    {
      id: 'starter',
      name: 'Starter',
      price: 59,
      priceId: process.env.REACT_APP_STRIPE_PROFESSIONAL_PRICE_ID,
      description: 'Safe, predictable labs with included overage calculator.',
      features: [
        'Everything in Free',
        'Custom Python, Node.js, and Go Environments',
        'Configurable CPU and Memory',
        '10 Concurrent Labs Included (30 min TTL)',
        'Overage: $0.20 per 30-min lab beyond included',
        'Optional Spend Cap',
        'Access External Services',
        'Priority Support'
      ],
      buttonText: 'Select Starter',
      selectable: true,
      popular: true
    },
    {
      id: 'premium',
      name: 'Premium',
      price: null,
      priceId: null,
      description: 'Custom needs, longer-lived labs, and enterprise controls.',
      features: [
        'Everything in Starter',
        'Configurable TTL (1h, 4h, 24h, or custom)',
        'Persistent Labs (resume where you left off)',
        'Unlimited Labs & Higher Concurrency Options',
        'Role-based Team Controls',
        'Advanced Usage Insights & Reporting',
        'Dedicated Success Manager & SLA',
        'Custom Security & Procurement Reviews'
      ],
      buttonText: 'Contact Sales',
      selectable: false,
      popular: false
    }
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white/80 dark:bg-cp-panel rounded-2xl overflow-hidden border border-gray-200 dark:border-cp-border shadow-sm">
        <div className="bg-gradient-to-r from-blue-600 to-green-500 px-6 py-8 text-white text-center">
          <h2 className="text-3xl font-bold mb-2">Upgrade Your Plan</h2>
          <p className="text-blue-50 max-w-2xl mx-auto">Choose the plan that fits your team. Start with Starter for predictable usage. Talk to us for Premium.</p>
        </div>

        <div className="px-6 py-10">
          {!selectedPlan && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
              {pricingTiers.map(tier => {
                const isStarter = tier.id === 'starter';
                const colClasses = isStarter ? 'md:col-span-6' : 'md:col-span-3';
                const priceDisplay = tier.price === null ? 'Custom' : tier.price === 0 ? '$0' : `$${tier.price}`;
                return (
                  <div
                    key={tier.id}
                    className={`relative bg-white rounded-2xl shadow-lg border-2 transition-all duration-300 hover:shadow-xl border-gray-200 hover:border-gray-300 flex flex-col ${tier.popular ? 'md:scale-[1.02]' : ''} ${colClasses}`}
                  >
                    {tier.popular && (
                      <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                        <span className="bg-gradient-to-r from-blue-600 to-green-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow">
                          Most Popular
                        </span>
                      </div>
                    )}
                    <div className="p-6 sm:p-8 flex flex-col flex-1">
                      <div className="text-center mb-6 sm:mb-8">
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">{tier.name}</h3>
                        <div className="flex items-baseline justify-center mb-4 min-h-[70px]">
                          {tier.price !== null ? (
                            <>
                              <span className="text-5xl font-extrabold text-gray-900">{priceDisplay}</span>
                              {tier.price > 0 && <span className="text-xl text-gray-500 ml-1">/month</span>}
                            </>
                          ) : (
                            <span className="text-3xl font-extrabold text-gray-900">Custom</span>
                          )}
                        </div>
                        <p className="text-gray-600 text-sm">{tier.description}</p>
                      </div>
                      {isStarter ? (
                        <div className="flex flex-col md:flex-row md:items-start md:gap-6">
                          <ul className="space-y-3 mb-6 md:mb-0 flex-1">
                            {tier.features.map((f,i)=>(
                              <li key={i} className="flex items-start">
                                <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5">✓</span>
                                <span className="text-gray-700 text-sm">{f}</span>
                              </li>
                            ))}
                          </ul>
                          <OverageCalculator compact vertical />
                        </div>
                      ) : (
                        <ul className="space-y-3 mb-6">
                          {tier.features.map((f,i)=>(
                            <li key={i} className="flex items-start">
                              <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5">✓</span>
                              <span className="text-gray-700 text-sm">{f}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-auto pt-2 sm:pt-4">
                        {tier.selectable ? (
                          <button
                            onClick={()=> setSelectedPlan(tier)}
                            className="w-full px-6 py-3 rounded-full text-sm font-semibold transition-all duration-300 shadow-sm hover:shadow bg-green-600 hover:bg-green-500 text-white"
                          >
                            {tier.buttonText}
                          </button>
                        ) : tier.id === 'premium' ? (
                          <button
                            onClick={()=> navigate('/contact')}
                            className="w-full px-6 py-3 rounded-full text-sm font-semibold transition-all duration-300 shadow-sm hover:shadow bg-gray-900 text-white hover:bg-black"
                          >
                            {tier.buttonText}
                          </button>
                        ) : (
                          <button
                            disabled
                            className="w-full px-6 py-3 rounded-full text-sm font-semibold bg-gray-200 text-gray-600 cursor-not-allowed"
                          >
                            {tier.buttonText}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedPlan && (
            <div className="max-w-3xl mx-auto">
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mb-8 dark:bg-cp-panel-alt dark:border-cp-border">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800">{selectedPlan.name} Plan</h3>
                    <p className="text-gray-600 text-sm">{selectedPlan.description}</p>
                  </div>
                  <button onClick={()=> setSelectedPlan(null)} className="text-green-600 hover:text-green-700 text-sm font-medium">Change Plan</button>
                </div>
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="text-2xl font-bold text-gray-900">${selectedPlan.price}/month</div>
                  <div className="text-sm text-gray-500">Cancel anytime</div>
                </div>
              </div>
              {selectedPlan.price > 0 && (
                <Elements stripe={stripePromise}>
                  <CheckoutForm selectedPlan={selectedPlan} />
                </Elements>
              )}
              {selectedPlan.price === 0 && (
                <div className="text-center p-8 bg-white/70 dark:bg-cp-panel-alt rounded-xl border border-gray-200 dark:border-cp-border backdrop-blur-sm">
                  <p className="text-gray-700 mb-4">You're already on the Free plan. Choose Starter to upgrade.</p>
                  <button onClick={()=> setSelectedPlan(null)} className="text-green-600 font-medium hover:underline">Back to plans</button>
                </div>
              )}
            </div>
          )}

          <div className="text-center text-xs text-gray-500 mt-10">
            <div className="flex items-center justify-center mb-2">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              Secure payment powered by Stripe
            </div>
            <p>Your payment information is encrypted and secure.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Upgrade;