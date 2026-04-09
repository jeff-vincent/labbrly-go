import React, { useState } from 'react';
import classNames from 'classnames';
import CreateLab from './CreateLab';
import EditLab from './EditLab';
import DeleteLab from './DeleteLab';
import MyLabs from './MyLabs';

const CMS = () => {
  const tabs = ['My Labs', 'Create Lab', 'Edit Lab', 'Delete Lab'];
  const [activeTab, setActiveTab] = useState('Create Lab');

  return (
    <div className="space-y-6 text-gray-700">
    {/* //   <div className="max-w-7xl mx-auto">
    //     <div className="bg-white rounded-2xl shadow-lg border border-gray-100"> */}
          {/* Header */}
          {/* <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 rounded-t-2xl">
            <h2 className="text-3xl font-bold text-white">Lab CMS</h2>
            <p className="text-blue-100 mt-2">Manage your educational content</p>
          </div> */}

          {/* Tabs + Content */}
          <div className="p-0 sm:p-2">
            {/* Tabs */}
            <div className="flex flex-wrap gap-2 border-b pb-2 mb-4 sm:mb-6">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={classNames(
                    'px-4 py-2 text-sm font-medium rounded-full transition',
                    activeTab === tab
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="transition-opacity duration-300 ease-in-out mt-4 sm:mt-6">
              {activeTab === 'My Labs' && (
                <div className="">
                  <MyLabs />
                </div>
              )}

              {activeTab === 'Create Lab' && (
                <div className="">
                  <CreateLab />
                </div>
              )}

              {activeTab === 'Edit Lab' && (
                <div className="">
                  <EditLab />
                </div>
              )}

              {activeTab === 'Delete Lab' && (
                <div className="">
                  <DeleteLab />
                </div>
              )}
            </div>
          </div>
    {/* //     </div> */}
    {/* //   </div> */}
    </div>
  );
};

export default CMS;
