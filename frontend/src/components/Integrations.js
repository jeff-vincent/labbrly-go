import React, { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

const MASK = '***';

export default function Integrations({ initial }) {
  const { getAccessTokenSilently } = useAuth0();
  const [form, setForm] = useState({
    // Segment - Core
    segment_write_key: '',
    segment_source_id: '',
    segment_workspace_slug: '',
    // Segment - Configuration
    segment_track_lab_sessions: false,
    segment_track_lab_interactions: false,
    segment_track_lab_performance: false,
    segment_track_web_funnel: false,
    segment_track_user_journey: false,
    segment_custom_traits: '',
    segment_lab_context_properties: '',
    segment_marketing_attribution: false,
    segment_event_sampling_rate: '100',
    
    // Mixpanel - Core
    mixpanel_token: '',
    mixpanel_project_id: '',
    mixpanel_api_secret: '',
    // Mixpanel - Configuration
    mixpanel_lab_engagement_events: false,
    mixpanel_lab_completion_funnels: false,
    mixpanel_cohort_analysis: false,
    mixpanel_acquisition_tracking: false,
    mixpanel_revenue_attribution: false,
    mixpanel_custom_properties: '',
    mixpanel_people_profiles: false,
    mixpanel_lab_categories: '',
    mixpanel_retention_events: '',
    
    // Amplitude - Core
    amplitude_api_key: '',
    amplitude_secret_key: '',
    amplitude_app_id: '',
    // Amplitude - Configuration
    amplitude_behavioral_cohorts: false,
    amplitude_path_analysis: false,
    amplitude_conversion_tracking: false,
    amplitude_lab_difficulty_analysis: false,
    amplitude_session_replay: false,
    amplitude_marketing_attribution: false,
    amplitude_predictive_analytics: false,
    amplitude_custom_user_properties: '',
    amplitude_lab_success_metrics: '',
    amplitude_ab_test_exposure: false,
    
    // PostHog - Core
    posthog_api_key: '',
    posthog_host: '',
    posthog_project_id: '',
    // PostHog - Configuration
    posthog_feature_flag_integration: false,
    posthog_heatmap_tracking: false,
    posthog_session_recordings: false,
    posthog_lab_performance_monitoring: false,
    posthog_conversion_funnels: false,
    posthog_cohort_analysis: false,
    posthog_custom_events: '',
    posthog_user_identification: '',
    posthog_lab_completion_goals: '',
    posthog_marketing_integration: false,
    
    // FullStory
    fullstory_org_id: '',
    fullstory_api_key: '',
    
    // Hotjar
    hotjar_id: '',
    hotjar_api_key: '',
    
    // Google Analytics - Core
    google_analytics_id: '',
    google_analytics_measurement_id: '',
    google_analytics_api_secret: '',
    // Google Analytics - Configuration
    ga4_enhanced_ecommerce: false,
    ga4_custom_dimensions: '',
    ga4_conversion_events: '',
    ga4_audience_segments: '',
    ga4_attribution_model: '',
    ga4_lab_engagement_tracking: false,
    ga4_cross_domain_tracking: false,
    ga4_demographic_data: false,
    ga4_site_search_tracking: false,
    ga4_scroll_tracking: false,
    
    // Google Tag Manager
    google_tag_manager_id: '',
    google_tag_manager_auth: '',
    google_tag_manager_preview: '',
    
    // Facebook Pixel
    facebook_pixel_id: '',
    facebook_access_token: '',
    facebook_app_secret: '',
    
    // LinkedIn Insight Tag
    linkedin_insight_tag: '',
    linkedin_api_key: '',
    
    // TikTok Pixel
    tiktok_pixel_id: '',
    tiktok_access_token: '',
    

    
    // HubSpot - Core
    hubspot_api_key: '',
    hubspot_portal_id: '',
    hubspot_client_id: '',
    hubspot_client_secret: '',
    hubspot_webhook_secret: '',
    // HubSpot - Configuration
    hubspot_lead_scoring: false,
    hubspot_lifecycle_automation: false,
    hubspot_custom_properties: '',
    hubspot_deal_automation: false,
    hubspot_email_triggers: '',
    hubspot_marketing_attribution: false,
    hubspot_company_enrichment: false,
    hubspot_behavioral_segments: '',
    hubspot_sales_notifications: false,
    
    // Salesforce
    salesforce_consumer_key: '',
    salesforce_consumer_secret: '',
    salesforce_username: '',
    salesforce_password: '',
    salesforce_security_token: '',
    
    // Slack - Core
    slack_webhook_url: '',
    slack_bot_token: '',
    slack_signing_secret: '',
    // Slack - Configuration
    slack_lab_completion_alerts: false,
    slack_error_notifications: false,
    slack_user_engagement_reports: false,
    slack_conversion_alerts: false,
    slack_channels_config: '',
    slack_mention_triggers: '',
    slack_custom_message_format: false,
    slack_alert_thresholds: '',
    slack_quiet_hours: '',
    
    // Custom Webhook
    custom_webhook_url: '',
    custom_webhook_secret: '',
    custom_webhook_headers: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [showOnlyConfigured, setShowOnlyConfigured] = useState(false);
  const [expandedIntegrations, setExpandedIntegrations] = useState(new Set());

  useEffect(() => {
    if (!initial || typeof initial !== 'object') return;
    // Pre-fill with masked markers if already set
    setForm((prev) => ({
      ...prev,
      ...Object.keys(prev).reduce((acc, k) => {
        const v = initial[k];
        if (v === undefined || v === null || v === '') return acc;
        // Server returns '***' if secret exists
        acc[k] = typeof v === 'string' ? v : '';
        return acc;
      }, {}),
    }));
  }, [initial]);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    setForm((p) => ({ ...p, [name]: newValue }));
  };

  const save = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const token = await getAccessTokenSilently({ audience: process.env.REACT_APP_AUTH0_AUDIENCE });
      // Only send values that are non-empty and not masked placeholders
      const payload = { integrations: {} };
      Object.entries(form).forEach(([k, v]) => {
        if (typeof v === 'string' && v && v !== MASK) {
          payload.integrations[k] = v;
        }
      });
      const res = await fetch('/orgs/org', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || res.statusText);
      }
      setSuccess('Saved');
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const Field = ({ name, label, placeholder, type = 'text', description, required = false }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-neutral-300">
        {type === 'checkbox' ? (
          <div className="flex items-center space-x-2">
            <input
              name={name}
              type="checkbox"
              checked={form[name] || false}
              onChange={onChange}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>{label}</span>
            {required && <span className="text-red-500 ml-1">*</span>}
          </div>
        ) : (
          <>
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </>
        )}
      </label>
      {description && (
        <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">{description}</p>
      )}
      {type !== 'checkbox' && (
        <>
          {type === 'textarea' ? (
            <textarea
              name={name}
              value={form[name] || ''}
              onChange={onChange}
              placeholder={placeholder}
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-cp-panel-alt dark:border-cp-border"
            />
          ) : (
            <input
              name={name}
              type={type}
              value={form[name] || ''}
              onChange={onChange}
              placeholder={placeholder}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-cp-panel-alt dark:border-cp-border"
            />
          )}
          {form[name] === MASK && (
            <p className="mt-1 text-xs text-green-600 dark:text-green-400">✓ Value is configured. Enter a new one to replace.</p>
          )}
        </>
      )}
    </div>
  );

  const toggleExpanded = (integrationId) => {
    const newExpanded = new Set(expandedIntegrations);
    if (newExpanded.has(integrationId)) {
      newExpanded.delete(integrationId);
    } else {
      newExpanded.add(integrationId);
    }
    setExpandedIntegrations(newExpanded);
  };

  const isConfigured = (fields) => {
    return fields.some(field => form[field] && form[field] !== '');
  };

  const getRequiredFieldCount = (fields) => {
    return fields.filter(field => form[field] && form[field] !== '').length;
  };

  const IntegrationCard = ({ id, name, description, logo, fields, webhookUrl, docsUrl }) => {
    const expanded = expandedIntegrations.has(id);
    const configured = isConfigured(fields.map(f => f.name));
    const configuredCount = getRequiredFieldCount(fields.map(f => f.name));

    return (
      <div className={`border rounded-lg transition-all duration-200 ${
        configured 
          ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' 
          : 'border-gray-200 bg-white dark:border-cp-border dark:bg-cp-panel'
      }`}>
        <div 
          className="p-4 cursor-pointer flex items-center justify-between hover:bg-gray-50 dark:hover:bg-cp-panel-alt transition-colors"
          onClick={() => toggleExpanded(id)}
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center text-sm font-semibold">
              {logo || name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-neutral-200">{name}</h4>
              <p className="text-sm text-gray-500 dark:text-neutral-400">{description}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {configured && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                {configuredCount}/{fields.length} configured
              </span>
            )}
            <svg 
              className={`w-5 h-5 transform transition-transform ${expanded ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        
        {expanded && (
          <div className="px-4 pb-4 border-t border-gray-200 dark:border-cp-border">
            <div className="pt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fields.map((field, index) => (
                  <Field
                    key={field.name}
                    name={field.name}
                    label={field.label}
                    placeholder={field.placeholder}
                    type={field.type || 'text'}
                    description={field.description}
                    required={field.required}
                  />
                ))}
              </div>
              
              {webhookUrl && (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200">Webhook URL</p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 font-mono break-all">{webhookUrl}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Use this URL in your {name} webhook configuration</p>
                </div>
              )}
              
              {docsUrl && (
                <div className="pt-2">
                  <a 
                    href={docsUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    View {name} Documentation
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const Section = ({ title, description, children, category }) => {
    // Filter logic
    const shouldShow = () => {
      if (selectedCategories.size > 0 && !selectedCategories.has(category)) {
        return false;
      }
      
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const titleMatch = title.toLowerCase().includes(searchLower);
        const descMatch = description?.toLowerCase().includes(searchLower);
        
        // Check if any child field matches the search
        const childrenArray = React.Children.toArray(children);
        const fieldMatch = childrenArray.some(child => {
          if (child.props?.label) {
            return child.props.label.toLowerCase().includes(searchLower) ||
                   child.props.description?.toLowerCase().includes(searchLower);
          }
          return false;
        });
        
        if (!titleMatch && !descMatch && !fieldMatch) {
          return false;
        }
      }
      
      return true;
    };

    if (!shouldShow()) {
      return null;
    }

    // Filter children based on search and configured status
    const filteredChildren = React.Children.toArray(children).filter(child => {
      if (showOnlyConfigured && child.props?.name) {
        const fieldValue = form[child.props.name];
        if (!fieldValue || fieldValue === '') {
          return false;
        }
      }
      
      if (searchTerm && child.props?.label) {
        const searchLower = searchTerm.toLowerCase();
        const labelMatch = child.props.label.toLowerCase().includes(searchLower);
        const descMatch = child.props.description?.toLowerCase().includes(searchLower);
        return labelMatch || descMatch;
      }
      
      return true;
    });

    if (filteredChildren.length === 0) {
      return null;
    }

    return (
      <div className="space-y-4">
        <div className="border-b border-gray-200 dark:border-cp-border pb-2">
          <h4 className="text-md font-medium text-gray-800 dark:text-neutral-200">{title}</h4>
          {description && (
            <p className="text-sm text-gray-600 dark:text-neutral-400">{description}</p>
          )}
          <div className="text-xs text-gray-500 dark:text-neutral-500 mt-1">
            {filteredChildren.filter(child => {
              const fieldValue = form[child.props?.name];
              return fieldValue && fieldValue !== '';
            }).length} / {filteredChildren.length} configured
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredChildren}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white p-6 rounded-lg border space-y-8 dark:bg-cp-panel dark:border-cp-border max-w-7xl">
      <div>
        <h3 className="text-xl font-semibold text-gray-800 dark:text-neutral-200">Integrations Hub</h3>
        <p className="text-sm text-gray-600 dark:text-neutral-400 mt-2">
          Connect your lab analytics and marketing pipeline to track both in-lab user experiences and broader funnel metrics. 
          All credentials are encrypted at rest and displayed as masked once configured.
        </p>
      </div>

      <div className="bg-gray-50 dark:bg-cp-panel-alt p-4 rounded-lg space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search integrations by name or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md dark:bg-cp-panel dark:border-cp-border dark:text-neutral-200"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showOnlyConfigured}
                onChange={(e) => setShowOnlyConfigured(e.target.checked)}
                className="rounded"
              />
              <span className="text-gray-700 dark:text-neutral-300">Only configured</span>
            </label>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {['Analytics', 'Marketing', 'CRM', 'Webhooks'].map(category => (
            <button
              key={category}
              onClick={() => {
                const newSelected = new Set(selectedCategories);
                if (newSelected.has(category)) {
                  newSelected.delete(category);
                } else {
                  newSelected.add(category);
                }
                setSelectedCategories(newSelected);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedCategories.has(category)
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-neutral-300 dark:hover:bg-gray-600'
              }`}
            >
              {category}
            </button>
          ))}
          {selectedCategories.size > 0 && (
            <button
              onClick={() => setSelectedCategories(new Set())}
              className="px-2 py-1 text-xs text-red-600 hover:text-red-700"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <Section 
        title="Product Analytics & User Behavior" 
        description="Track user interactions, lab sessions, and product usage patterns"
        category="Analytics"
      >
        <IntegrationCard
          id="segment"
          name="Segment"
          description="Customer data platform and universal data pipeline"
          logo="S"
          webhookUrl="https://api.labbrly.com/webhooks/segment"
          docsUrl="https://segment.com/docs/connections/sources/catalog/libraries/server/http-api/"
          fields={[
            { name: 'segment_write_key', label: 'Write Key', placeholder: 'wk_...', required: true, description: 'Your Segment source write key' },
            { name: 'segment_source_id', label: 'Source ID', placeholder: 'src_...', description: 'Optional: Segment source identifier' },
            { name: 'segment_workspace_slug', label: 'Workspace Slug', placeholder: 'my-workspace', description: 'Your Segment workspace slug' },
            { name: 'segment_track_lab_sessions', label: 'Track Lab Sessions', type: 'checkbox', description: 'Send lab session start/end events to Segment' },
            { name: 'segment_track_lab_interactions', label: 'Track Lab Interactions', type: 'checkbox', description: 'Track terminal commands, file operations, and code execution' },
            { name: 'segment_track_lab_performance', label: 'Track Lab Performance', type: 'checkbox', description: 'Monitor lab loading times and resource usage' },
            { name: 'segment_track_web_funnel', label: 'Track Web Funnel', type: 'checkbox', description: 'Track page views, referrers, and conversion events' },
            { name: 'segment_track_user_journey', label: 'Track User Journey', type: 'checkbox', description: 'Map complete user journey from marketing to lab completion' },
            { name: 'segment_custom_traits', label: 'Custom User Traits', placeholder: 'company_size,industry,role', description: 'Comma-separated list of custom traits to capture' },
            { name: 'segment_lab_context_properties', label: 'Lab Context Properties', placeholder: 'lab_type,difficulty_level,estimated_time', description: 'Additional lab metadata to include in events' },
            { name: 'segment_marketing_attribution', label: 'Marketing Attribution', type: 'checkbox', description: 'Include UTM parameters and referrer data in all events' },
            { name: 'segment_event_sampling_rate', label: 'Event Sampling Rate (%)', placeholder: '100', description: 'Percentage of events to send (1-100, default: 100)' }
          ]}
        />
        
        <IntegrationCard
          id="mixpanel"
          name="Mixpanel"
          description="Product analytics with event tracking and funnel analysis"
          logo="M"
          webhookUrl="https://api.labbrly.com/webhooks/mixpanel"
          docsUrl="https://developer.mixpanel.com/docs/implement-mixpanel"
          fields={[
            { name: 'mixpanel_token', label: 'Project Token', placeholder: 'abc123...', required: true, description: 'Your Mixpanel project token' },
            { name: 'mixpanel_project_id', label: 'Project ID', placeholder: '123456', description: 'Mixpanel project identifier' },
            { name: 'mixpanel_api_secret', label: 'API Secret', placeholder: '...', type: 'password', description: 'For server-side API calls' },
            { name: 'mixpanel_lab_engagement_events', label: 'Lab Engagement Events', type: 'checkbox', description: 'Track lab interactions like command execution, file edits, terminal activity' },
            { name: 'mixpanel_lab_completion_funnels', label: 'Lab Completion Funnels', type: 'checkbox', description: 'Create funnels for lab progression and completion rates' },
            { name: 'mixpanel_cohort_analysis', label: 'User Cohort Analysis', type: 'checkbox', description: 'Group users by lab completion behavior and retention' },
            { name: 'mixpanel_acquisition_tracking', label: 'Acquisition Tracking', type: 'checkbox', description: 'Track marketing channels and campaign performance' },
            { name: 'mixpanel_revenue_attribution', label: 'Revenue Attribution', type: 'checkbox', description: 'Connect lab usage to conversion and revenue events' },
            { name: 'mixpanel_custom_properties', label: 'Custom Event Properties', placeholder: 'lab_duration,commands_executed,files_created', description: 'Additional properties to track with events' },
            { name: 'mixpanel_people_profiles', label: 'People Profiles', type: 'checkbox', description: 'Create and update user profiles with lab activity data' },
            { name: 'mixpanel_lab_categories', label: 'Lab Categories to Track', placeholder: 'beginner,intermediate,advanced', description: 'Specific lab types to focus analytics on' },
            { name: 'mixpanel_retention_events', label: 'Retention Analysis Events', placeholder: 'lab_completed,lab_bookmarked,lab_shared', description: 'Key events for measuring user retention' }
          ]}
        />

        <IntegrationCard
          id="amplitude"
          name="Amplitude"
          description="Digital analytics platform for user behavior insights"
          logo="A"
          webhookUrl="https://api.labbrly.com/webhooks/amplitude"
          docsUrl="https://developers.amplitude.com/"
          fields={[
            { name: 'amplitude_api_key', label: 'API Key', placeholder: 'amp_...', required: true, description: 'Your Amplitude API key' },
            { name: 'amplitude_secret_key', label: 'Secret Key', placeholder: '...', type: 'password', required: true, description: 'Amplitude secret key for server-side events' },
            { name: 'amplitude_app_id', label: 'App ID', placeholder: '123456', description: 'Amplitude application identifier' },
            { name: 'amplitude_behavioral_cohorts', label: 'Behavioral Cohorts', type: 'checkbox', description: 'Automatically create cohorts based on lab completion patterns' },
            { name: 'amplitude_path_analysis', label: 'User Path Analysis', type: 'checkbox', description: 'Track user navigation paths through labs and platform features' },
            { name: 'amplitude_conversion_tracking', label: 'Conversion Tracking', type: 'checkbox', description: 'Monitor conversion from trial to paid, free to premium features' },
            { name: 'amplitude_lab_difficulty_analysis', label: 'Lab Difficulty Analysis', type: 'checkbox', description: 'Analyze user success rates across different lab complexity levels' },
            { name: 'amplitude_session_replay', label: 'Session Replay Integration', type: 'checkbox', description: 'Connect lab sessions with Amplitude session replay data' },
            { name: 'amplitude_marketing_attribution', label: 'Marketing Attribution', type: 'checkbox', description: 'Track attribution from marketing channels to lab engagement' },
            { name: 'amplitude_predictive_analytics', label: 'Predictive Analytics', type: 'checkbox', description: 'Enable churn prediction and user lifetime value modeling' },
            { name: 'amplitude_custom_user_properties', label: 'Custom User Properties', placeholder: 'skill_level,preferred_stack,company_type', description: 'User properties to enrich analytics' },
            { name: 'amplitude_lab_success_metrics', label: 'Lab Success Metrics', placeholder: 'completion_rate,time_to_complete,error_rate', description: 'Key metrics to measure lab effectiveness' },
            { name: 'amplitude_ab_test_exposure', label: 'A/B Test Exposure Tracking', type: 'checkbox', description: 'Track user exposure to different lab versions and features' }
          ]}
        />

        <IntegrationCard
          id="posthog"
          name="PostHog"
          description="Open-source product analytics and feature flags"
          logo="P"
          webhookUrl="https://api.labbrly.com/webhooks/posthog"
          docsUrl="https://posthog.com/docs"
          fields={[
            { name: 'posthog_api_key', label: 'API Key', placeholder: 'phc_...', required: true, description: 'Your PostHog project API key' },
            { name: 'posthog_host', label: 'Instance Host', placeholder: 'https://app.posthog.com', required: true, description: 'PostHog instance URL' },
            { name: 'posthog_project_id', label: 'Project ID', placeholder: '123', description: 'PostHog project identifier' },
            { name: 'posthog_feature_flag_integration', label: 'Feature Flag Integration', type: 'checkbox', description: 'Use PostHog feature flags to control lab features and experiments' },
            { name: 'posthog_heatmap_tracking', label: 'Heatmap Tracking', type: 'checkbox', description: 'Generate heatmaps for lab interface interactions' },
            { name: 'posthog_session_recordings', label: 'Session Recordings', type: 'checkbox', description: 'Record user sessions within lab environments (privacy compliant)' },
            { name: 'posthog_lab_performance_monitoring', label: 'Lab Performance Monitoring', type: 'checkbox', description: 'Track lab loading times, resource usage, and error rates' },
            { name: 'posthog_conversion_funnels', label: 'Conversion Funnels', type: 'checkbox', description: 'Create funnels from landing page to lab completion' },
            { name: 'posthog_cohort_analysis', label: 'Cohort Analysis', type: 'checkbox', description: 'Analyze user retention and engagement over time' },
            { name: 'posthog_custom_events', label: 'Custom Lab Events', placeholder: 'terminal_command,file_save,code_run,lab_hint_used', description: 'Specific lab interactions to track' },
            { name: 'posthog_user_identification', label: 'User Identification Strategy', placeholder: 'email,user_id,anonymous_id', description: 'How to identify users across sessions' },
            { name: 'posthog_lab_completion_goals', label: 'Lab Completion Goals', placeholder: 'complete_exercise,pass_validation,submit_project', description: 'Define success events for each lab type' },
            { name: 'posthog_marketing_integration', label: 'Marketing Campaign Integration', type: 'checkbox', description: 'Connect marketing campaigns to lab engagement and conversion' }
          ]}
        />

        <IntegrationCard
          id="fullstory"
          name="FullStory"
          description="Digital experience analytics with session replay"
          logo="F"
          docsUrl="https://developer.fullstory.com/"
          fields={[
            { name: 'fullstory_org_id', label: 'Organization ID', placeholder: 'FS123...', required: true, description: 'Your FullStory org identifier' },
            { name: 'fullstory_api_key', label: 'API Key', placeholder: '...', type: 'password', description: 'For accessing FullStory APIs' }
          ]}
        />

        <IntegrationCard
          id="hotjar"
          name="Hotjar"
          description="Behavior analytics with heatmaps and recordings"
          logo="H"
          docsUrl="https://help.hotjar.com/hc/en-us/categories/115001323967-Integrations"
          fields={[
            { name: 'hotjar_id', label: 'Site ID', placeholder: '123456', required: true, description: 'Your Hotjar site identifier' },
            { name: 'hotjar_api_key', label: 'API Key', placeholder: '...', type: 'password', description: 'For Hotjar API access' }
          ]}
        />
      </Section>

      <Section 
        title="Marketing Analytics & Attribution" 
        description="Track marketing campaigns, attribution, and conversion funnels"
        category="Marketing"
      >
        <IntegrationCard
          id="google_analytics"
          name="Google Analytics 4"
          description="Web analytics and reporting platform"
          logo="GA"
          docsUrl="https://developers.google.com/analytics/devguides/collection/ga4"
          fields={[
            { name: 'google_analytics_id', label: 'Property ID', placeholder: 'GA4-123456789-1', required: true, description: 'Your GA4 property ID' },
            { name: 'google_analytics_measurement_id', label: 'Measurement ID', placeholder: 'G-XXXXXXXXXX', required: true, description: 'GA4 measurement ID for web streams' },
            { name: 'google_analytics_api_secret', label: 'API Secret', placeholder: '...', type: 'password', description: 'For Measurement Protocol events' },
            { name: 'ga4_enhanced_ecommerce', label: 'Enhanced Ecommerce', type: 'checkbox', description: 'Track lab purchases, upgrades, and subscription events' },
            { name: 'ga4_custom_dimensions', label: 'Custom Dimensions', placeholder: 'lab_category,user_skill_level,lab_difficulty', description: 'Custom dimensions to configure in GA4' },
            { name: 'ga4_conversion_events', label: 'Conversion Events', placeholder: 'lab_completed,sign_up,purchase,trial_started', description: 'Events to mark as conversions in GA4' },
            { name: 'ga4_audience_segments', label: 'Audience Segments', placeholder: 'lab_completers,trial_users,power_users', description: 'User segments to create for remarketing' },
            { name: 'ga4_attribution_model', label: 'Attribution Model', placeholder: 'last_click,first_click,linear,data_driven', description: 'Attribution model for conversion tracking' },
            { name: 'ga4_lab_engagement_tracking', label: 'Lab Engagement Tracking', type: 'checkbox', description: 'Track time spent in labs, interactions, and completion rates' },
            { name: 'ga4_cross_domain_tracking', label: 'Cross-Domain Tracking', type: 'checkbox', description: 'Track users across multiple domains (labs, marketing site, etc.)' },
            { name: 'ga4_demographic_data', label: 'Demographic Data Collection', type: 'checkbox', description: 'Enable demographic and interest reporting' },
            { name: 'ga4_site_search_tracking', label: 'Site Search Tracking', type: 'checkbox', description: 'Track internal searches for labs and content' },
            { name: 'ga4_scroll_tracking', label: 'Scroll Tracking', type: 'checkbox', description: 'Track page scroll depth and engagement' }
          ]}
        />

        <IntegrationCard
          id="google_tag_manager"
          name="Google Tag Manager"
          description="Tag management system for marketing tags"
          logo="GTM"
          docsUrl="https://developers.google.com/tag-manager"
          fields={[
            { name: 'google_tag_manager_id', label: 'Container ID', placeholder: 'GTM-XXXXXXX', required: true, description: 'Your GTM container ID' },
            { name: 'google_tag_manager_auth', label: 'Auth Token', placeholder: '...', description: 'For preview mode authentication' },
            { name: 'google_tag_manager_preview', label: 'Preview ID', placeholder: 'env-...', description: 'Environment preview identifier' }
          ]}
        />

        <IntegrationCard
          id="facebook_pixel"
          name="Facebook Pixel"
          description="Meta advertising and conversion tracking"
          logo="FB"
          docsUrl="https://developers.facebook.com/docs/marketing-api/conversions-api"
          fields={[
            { name: 'facebook_pixel_id', label: 'Pixel ID', placeholder: '123456789012345', required: true, description: 'Your Facebook pixel identifier' },
            { name: 'facebook_access_token', label: 'Access Token', placeholder: '...', type: 'password', required: true, description: 'Conversions API access token' },
            { name: 'facebook_app_secret', label: 'App Secret', placeholder: '...', type: 'password', description: 'For webhook verification' }
          ]}
        />

        <IntegrationCard
          id="linkedin_insight"
          name="LinkedIn Insight Tag"
          description="LinkedIn campaign tracking and attribution"
          logo="LI"
          docsUrl="https://www.linkedin.com/help/lms/answer/a417930"
          fields={[
            { name: 'linkedin_insight_tag', label: 'Partner ID', placeholder: '123456', required: true, description: 'LinkedIn Insight Tag partner ID' },
            { name: 'linkedin_api_key', label: 'API Key', placeholder: '...', type: 'password', description: 'For LinkedIn Marketing API' }
          ]}
        />

        <IntegrationCard
          id="tiktok_pixel"
          name="TikTok Pixel"
          description="TikTok advertising and conversion tracking"
          logo="TT"
          docsUrl="https://ads.tiktok.com/marketing_api/docs"
          fields={[
            { name: 'tiktok_pixel_id', label: 'Pixel ID', placeholder: 'TTXXXXXXXXXXXXXXX', required: true, description: 'Your TikTok pixel code' },
            { name: 'tiktok_access_token', label: 'Access Token', placeholder: '...', type: 'password', description: 'For TikTok Marketing API' }
          ]}
        />
      </Section>





      <Section 
        title="CRM & Sales" 
        description="Connect to your sales and customer relationship management tools"
        category="CRM"
      >
        <IntegrationCard
          id="hubspot"
          name="HubSpot"
          description="Inbound marketing, sales, and CRM platform"
          logo="HS"
          webhookUrl="https://api.labbrly.com/webhooks/hubspot"
          docsUrl="https://developers.hubspot.com/"
          fields={[
            { name: 'hubspot_api_key', label: 'Private App Token', placeholder: 'pat-...', type: 'password', required: true, description: 'HubSpot private app access token' },
            { name: 'hubspot_portal_id', label: 'Portal ID', placeholder: '12345678', description: 'Your HubSpot portal identifier' },
            { name: 'hubspot_client_id', label: 'Client ID', placeholder: '...', description: 'OAuth app client ID' },
            { name: 'hubspot_client_secret', label: 'Client Secret', placeholder: '...', type: 'password', description: 'OAuth app client secret' },
            { name: 'hubspot_webhook_secret', label: 'Webhook Secret', placeholder: '...', type: 'password', description: 'For webhook verification' },
            { name: 'hubspot_lead_scoring', label: 'Lab-Based Lead Scoring', type: 'checkbox', description: 'Score leads based on lab completion and engagement levels' },
            { name: 'hubspot_lifecycle_automation', label: 'Lifecycle Stage Automation', type: 'checkbox', description: 'Automatically move contacts through lifecycle stages based on lab activity' },
            { name: 'hubspot_custom_properties', label: 'Custom Contact Properties', placeholder: 'labs_completed,skill_level,preferred_technologies', description: 'Custom properties to sync from lab activity' },
            { name: 'hubspot_deal_automation', label: 'Deal Creation Automation', type: 'checkbox', description: 'Automatically create deals based on lab completion and engagement' },
            { name: 'hubspot_email_triggers', label: 'Email Workflow Triggers', placeholder: 'lab_completed,trial_started,lab_struggle_detected', description: 'Lab events that should trigger email workflows' },
            { name: 'hubspot_marketing_attribution', label: 'Marketing Attribution', type: 'checkbox', description: 'Connect marketing campaigns to lab sign-ups and conversions' },
            { name: 'hubspot_company_enrichment', label: 'Company Data Enrichment', type: 'checkbox', description: 'Automatically enrich company data based on user lab activity' },
            { name: 'hubspot_behavioral_segments', label: 'Behavioral Segmentation', placeholder: 'power_users,beginners,enterprise_prospects', description: 'Segments to create based on lab behavior' },
            { name: 'hubspot_sales_notifications', label: 'Sales Team Notifications', type: 'checkbox', description: 'Notify sales team when high-value prospects complete labs' }
          ]}
        />

        <IntegrationCard
          id="salesforce"
          name="Salesforce"
          description="Customer relationship management platform"
          logo="SF"
          webhookUrl="https://api.labbrly.com/webhooks/salesforce"
          docsUrl="https://developer.salesforce.com/"
          fields={[
            { name: 'salesforce_consumer_key', label: 'Consumer Key', placeholder: '...', required: true, description: 'Connected app consumer key' },
            { name: 'salesforce_consumer_secret', label: 'Consumer Secret', placeholder: '...', type: 'password', required: true, description: 'Connected app consumer secret' },
            { name: 'salesforce_username', label: 'Username', placeholder: 'user@company.com', required: true, description: 'Salesforce username' },
            { name: 'salesforce_password', label: 'Password', placeholder: '...', type: 'password', required: true, description: 'Salesforce password' },
            { name: 'salesforce_security_token', label: 'Security Token', placeholder: '...', type: 'password', description: 'Salesforce security token' }
          ]}
        />
      </Section>









      <Section 
        title="Team Communication & Custom Webhooks" 
        description="Team notifications and custom integration endpoints"
        category="Webhooks"
      >
        <IntegrationCard
          id="slack"
          name="Slack"
          description="Team communication and collaboration platform"
          logo="SL"
          docsUrl="https://api.slack.com/"
          fields={[
            { name: 'slack_webhook_url', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/services/...', required: true, description: 'Slack incoming webhook URL' },
            { name: 'slack_bot_token', label: 'Bot Token', placeholder: 'xoxb-...', type: 'password', description: 'Slack bot user OAuth token' },
            { name: 'slack_signing_secret', label: 'Signing Secret', placeholder: '...', type: 'password', description: 'For Slack event verification' },
            { name: 'slack_lab_completion_alerts', label: 'Lab Completion Alerts', type: 'checkbox', description: 'Notify team when users complete labs or hit milestones' },
            { name: 'slack_error_notifications', label: 'Error Notifications', type: 'checkbox', description: 'Send alerts for lab crashes, system errors, and critical issues' },
            { name: 'slack_user_engagement_reports', label: 'Daily Engagement Reports', type: 'checkbox', description: 'Send daily summaries of lab usage and user activity' },
            { name: 'slack_conversion_alerts', label: 'Conversion Alerts', type: 'checkbox', description: 'Notify when users convert from trial to paid or complete high-value actions' },
            { name: 'slack_channels_config', label: 'Channel Configuration', placeholder: '#analytics,#support,#sales', description: 'Channels for different types of notifications' },
            { name: 'slack_mention_triggers', label: 'Mention Triggers', placeholder: '@channel,@here,@sales-team', description: 'When to mention specific users or groups' },
            { name: 'slack_custom_message_format', label: 'Custom Message Format', type: 'checkbox', description: 'Use rich formatting with lab details, user info, and action buttons' },
            { name: 'slack_alert_thresholds', label: 'Alert Thresholds', placeholder: 'error_rate>5%,completion_rate<50%', description: 'Conditions that trigger alerts' },
            { name: 'slack_quiet_hours', label: 'Quiet Hours', placeholder: '22:00-08:00', description: 'Hours to suppress non-critical notifications (24h format)' }
          ]}
        />

        <IntegrationCard
          id="custom_webhook"
          name="Custom Webhook"
          description="Send events to your own custom endpoint"
          logo="CW"
          fields={[
            { name: 'custom_webhook_url', label: 'Webhook URL', placeholder: 'https://your-api.com/webhook', required: true, description: 'Your custom webhook endpoint' },
            { name: 'custom_webhook_secret', label: 'Webhook Secret', placeholder: '...', type: 'password', description: 'For webhook signature verification' },
            { name: 'custom_webhook_headers', label: 'Custom Headers', placeholder: 'Authorization: Bearer token\nX-Custom-Header: value', type: 'textarea', description: 'Additional headers (one per line)' }
          ]}
        />
      </Section>

      <div className="sticky bottom-0 bg-white dark:bg-cp-panel border-t dark:border-cp-border pt-4 mt-8">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-neutral-400">
            {(() => {
              // Define integration groups by their primary keys
              const integrations = {
                'Segment': form.segment_write_key,
                'Mixpanel': form.mixpanel_token,
                'Amplitude': form.amplitude_api_key,
                'PostHog': form.posthog_api_key,
                'FullStory': form.fullstory_org_id,
                'Hotjar': form.hotjar_id,
                'Google Analytics': form.google_analytics_id,
                'Google Tag Manager': form.google_tag_manager_id,
                'Facebook Pixel': form.facebook_pixel_id,
                'LinkedIn Insight': form.linkedin_insight_tag,
                'TikTok Pixel': form.tiktok_pixel_id,
                'HubSpot': form.hubspot_api_key,
                'Salesforce': form.salesforce_consumer_key,
                'Slack': form.slack_webhook_url,
                'Custom Webhook': form.custom_webhook_url
              };
              
              const configuredCount = Object.values(integrations).filter(value => value && value !== '' && value !== MASK).length;
              const totalCount = Object.keys(integrations).length;
              
              return `${configuredCount} of ${totalCount} integrations configured`;
            })()}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                const confirmed = window.confirm('This will clear all integration fields. Are you sure?');
                if (confirmed) {
                  setForm(Object.keys(form).reduce((acc, key) => ({ ...acc, [key]: '' }), {}));
                }
              }}
              className="inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-neutral-200 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Clear All
            </button>
            <button 
              onClick={save} 
              disabled={loading} 
              className="inline-flex items-center rounded-md bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-2 text-sm font-medium text-white hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all duration-200"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save All Integrations
                </>
              )}
            </button>
          </div>
        </div>
        {success && (
          <div className="mt-2 text-sm text-green-600 dark:text-green-400 flex items-center">
            <svg className="mr-1 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {success} - Your integrations have been securely saved!
          </div>
        )}
        {error && (
          <div className="mt-2 text-sm text-red-600 dark:text-red-400 flex items-center">
            <svg className="mr-1 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Error: {error}
          </div>
        )}
      </div>
    </div>
  );
}
