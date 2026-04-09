import React from 'react';
import { useNavigate } from 'react-router-dom';
import OverageCalculator from './OverageCalculator';

const PlansInfo = () => {
  const navigate = useNavigate();

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
      buttonText: 'Get Started Free',
      popular: false
    },
    {
      id: 'professional',
      name: 'Starter',
      price: 59,
      priceId: process.env.REACT_APP_STRIPE_PROFESSIONAL_PRICE_ID,
      description: 'Safe, predictable labs with included overage calculator.',
      features: [
        'Everything in Free',
        'Custom Python, Node.js, and Go Environments',
        'Configurable CPU and Memory',
        '10 Concurrent Labs Included (30 min TTL)',
        'Overage: $0.20 per compute unit beyond included',
        'Optional Spend Cap (never pay more than you set)',
        'Access External Services',
        'Priority Support'
      ],
      buttonText: 'Start Starter Plan',
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
      popular: false
    }
  ];

  return (
  <div className="min-h-screen bg-white dark:bg-cp-bg py-12 px-4 sm:px-6 lg:px-8 transition-colors">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-neutral-100 mb-4 sm:mb-0">Join Lab Thingy</h1>
            <button
              onClick={() => navigate('/signup')}
              className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 sm:px-8 sm:py-3 rounded-full text-base sm:text-lg font-semibold transition-colors shadow-sm hover:shadow md:mx-0"
            >
              Create a free account
            </button>
          </div>
          <p className="text-xl text-gray-600 dark:text-neutral-400 mx-8 sm:mx-16 md:mx-24 lg:mx-40 px-4 py-6">Cause, you know, learn people up on your softwares and such.</p>
        </div>

        {/* Pricing Tiers */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-16 items-stretch">
          {pricingTiers.map((tier) => {
            const isProfessional = tier.id === 'professional';
            const colClasses = isProfessional ? 'md:col-span-6' : 'md:col-span-3';
            return (
              <div
                key={tier.id}
                className={`relative bg-white/80 dark:bg-cp-panel backdrop-blur-sm rounded-2xl shadow-sm border transition-all duration-300 hover:shadow border-gray-200 dark:border-cp-border hover:border-blue-600/50 flex flex-col ${tier.popular ? 'md:scale-[1.02]' : ''} ${colClasses}`}
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
                          <span className="text-5xl font-extrabold text-gray-900">${tier.price}</span>
                          {tier.price > 0 && <span className="text-xl text-gray-500 ml-1">/month</span>}
                        </>
                      ) : (
                        <span className="text-3xl font-extrabold text-gray-900">Custom</span>
                      )}
                    </div>
                    <p className="text-gray-600 dark:text-neutral-400">{tier.description}</p>
                  </div>

                  {isProfessional ? (
                    <div className="flex flex-col md:flex-row md:items-start md:gap-6">
                      <ul className="space-y-4 mb-6 md:mb-0 flex-1">
                        {tier.features.map((feature, index) => (
                          <li key={index} className="flex items-start">
                            <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5">✓</span>
                            <span className="text-gray-700 dark:text-neutral-300 text-sm sm:text-base">{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <OverageCalculator compact vertical />
                    </div>
                  ) : (
                    <ul className="space-y-4 mb-6">
                      {tier.features.map((feature, index) => (
                        <li key={index} className="flex items-start">
                          <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5">✓</span>
                          <span className="text-gray-700 dark:text-neutral-300 text-sm sm:text-base">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="pt-4 sm:pt-6 mt-auto">
                    <button
                      disabled={tier.price === null}
                      onClick={() => tier.price !== null && navigate('/signup')}
                      className={`w-full px-6 py-3 rounded-full text-sm font-semibold transition-all duration-300 shadow-md hover:shadow-lg 
                        ${tier.price === null ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-neutral-500 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 text-white'}
                      `}
                    >
                      {tier.buttonText}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PlansInfo;
