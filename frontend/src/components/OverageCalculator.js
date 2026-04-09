import React, { useState } from 'react';

// Overage calculator for the Professional plan
// Assumptions:
//  - Professional plan includes 10 concurrent users (base price covers typical usage)
//  - Overage is billed at $0.20 per 30-minute lab execution block beyond included usage
//  - User supplies number of extra 30-minute blocks they expect to run in a month
//  - We simply multiply blocks * 0.20 and add to base price (59)

const OverageCalculator = ({ basePrice = 59, ratePerBlock = 0.20, compact = false, vertical = false }) => {
  const [extraBlocks, setExtraBlocks] = useState(0);

  const handleChange = (e) => {
    const v = e.target.value;
    if (v === '') {
      setExtraBlocks('');
      return;
    }
    const num = Math.max(0, parseInt(v, 10) || 0);
    setExtraBlocks(num);
  };

  const overageCost = (extraBlocks || 0) * ratePerBlock;
  const total = basePrice + overageCost;

  if (compact) {
    // Two compact variants: default (grid summary) and vertical side (stacked boxes)
    if (vertical) {
      return (
  <div className="mt-2 md:mt-0 md:ml-6 bg-gradient-to-b from-blue-50 to-green-50 rounded-xl p-4 flex flex-col h-full w-full max-w-xs">
          <h4 className="text-sm font-semibold text-black mb-3 flex items-center gap-2">
            Overage Estimator
            <span className="text-[9px] uppercase tracking-wide bg-green-600 text-white px-1.5 py-0.5 rounded-full">Beta</span>
          </h4>
          <div className="mb-3">
            <label htmlFor="extraBlocks" className="block text-xs text-black font-semibold mb-1">
              Extra compute units
            </label>
            <input
              id="extraBlocks"
              type="number"
              min="0"
              value={extraBlocks}
              onChange={handleChange}
              className="w-full rounded-md border border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-600 px-3 py-1.5 text-sm text-gray-900 bg-white placeholder-gray-400"
              placeholder="0"
            />
            <p className="text-[10px] text-black mt-1">$0.20 per compute unit beyond the included 10 concurrent users.</p>
          </div>
          <div className="space-y-2 flex-1">
            <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 flex items-center justify-between">
              <p className="text-[11px] font-medium text-gray-600">Base</p>
              <p className="text-sm font-bold text-gray-900">${basePrice.toFixed(0)}</p>
            </div>
            <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 flex items-center justify-between">
              <p className="text-[11px] font-medium text-gray-600">Overage</p>
              <p className="text-sm font-bold text-gray-900">${overageCost.toFixed(2)}</p>
            </div>
            <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 flex items-center justify-between">
              <p className="text-[11px] font-medium text-gray-600">Total</p>
              <p className="text-sm font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-green-500">${total.toFixed(2)}</p>
            </div>
          </div>
          <p className="text-[9px] text-gray-500 mt-3 leading-snug">Estimate only. Actual usage rounded up to 30m blocks.</p>
        </div>
      );
    }
    return (
  <div className="mt-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-xl p-4 space-y-4">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          Overage Estimator
          <span className="text-[10px] uppercase tracking-wide bg-green-600 text-white px-2 py-0.5 rounded-full">Beta</span>
        </h4>
        <div>
          <label htmlFor="extraBlocks" className="block text-xs font-semibold text-gray-900 mb-1">
            Extra 30m lab blocks (est.)
          </label>
          <input
            id="extraBlocks"
            type="number"
            min="0"
            value={extraBlocks}
            onChange={handleChange}
            className="w-full rounded-md border border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-600 px-3 py-1.5 text-sm text-gray-900 bg-white placeholder-gray-400"
            placeholder="0"
          />
          <p className="text-[10px] text-gray-900 mt-1">$0.10 / block beyond included concurrency.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-white rounded-lg p-2 shadow-sm border border-gray-200">
            <p className="text-[10px] font-medium text-gray-600">Base</p>
            <p className="text-sm font-bold text-gray-900">${basePrice.toFixed(0)}</p>
          </div>
            <div className="bg-white rounded-lg p-2 shadow-sm border border-gray-200">
            <p className="text-[10px] font-medium text-gray-600">Overage</p>
            <p className="text-sm font-bold text-gray-900">${overageCost.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg p-2 shadow-sm border border-gray-200">
            <p className="text-[10px] font-medium text-gray-600">Total</p>
            <p className="text-sm font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-green-500">${total.toFixed(2)}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-2xl mx-auto">
  <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">Starter Plan Overage Estimator</h2>
      <p className="text-gray-600 mb-6 text-sm sm:text-base leading-relaxed">
        The Professional plan includes up to <strong>10 concurrent users</strong>. If your team runs more labs than the included capacity translates to, overages are billed at <strong>$0.10 per 30-minute lab block</strong> (each started 30m counts as one block). Use this tool to estimate your monthly cost.
      </p>
      <div className="space-y-6">
        <div>
          <label htmlFor="extraBlocks" className="block text-sm font-semibold text-gray-900 mb-2">
            Estimated extra 30-minute lab blocks this month
          </label>
          <input
            id="extraBlocks"
            type="number"
            min="0"
            value={extraBlocks}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-600 px-4 py-2 text-base text-gray-900 bg-white placeholder-gray-400"
            placeholder="0"
          />
          <p className="text-xs text-gray-900 mt-2">Tip: 1 lab running for 2 hours = 4 blocks. 15 labs running for ~1 hour each = 30 blocks.</p>
        </div>

  <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-700">Base monthly price</p>
            <p className="text-xl font-bold text-gray-900">${basePrice.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">Estimated overage ({extraBlocks || 0} blocks)</p>
            <p className="text-xl font-bold text-gray-900">${overageCost.toFixed(2)}</p>
          </div>
          <div className="sm:border-l sm:pl-6 sm:ml-2">
            <p className="text-sm font-semibold text-gray-700">Estimated total</p>
            <p className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-green-500">${total.toFixed(2)}</p>
          </div>
        </div>

        <div className="text-xs text-gray-500 leading-relaxed">
          <p>
            This is an estimate only. Actual billed overage is based on measured lab runtime rounded up to 30-minute blocks. Concurrency spikes may increase block count. Contact us if you need a custom rate or higher included concurrency.
          </p>
        </div>
      </div>
    </div>
  );
};

export default OverageCalculator;
