/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './public/index.html'
  ],
  theme: {
    extend: {
      colors: {
        'cp-bg': '#0d0d11',
        'cp-panel': '#1e1f26',
        'cp-panel-alt': '#24262f',
        'cp-border': '#34363f',
        'cp-accent': '#fcd000',
        'cp-green': '#47cf73',
        'cp-blue': '#0ebeff',
        'cp-purple': '#ae63e4',
        'cp-orange': '#ff8800'
      },
      boxShadow: {
        'cp-sm': '0 1px 2px 0 rgba(0,0,0,0.5)',
        'cp': '0 2px 6px -1px rgba(0,0,0,0.6), 0 4px 12px -2px rgba(0,0,0,0.5)'
      },
      fontFamily: {
        mono: [ 'JetBrains Mono', 'SFMono-Regular', 'Menlo', 'monospace' ]
      },
      backgroundImage: {
        'cp-gradient': 'linear-gradient(135deg,#1e1f26 0%,#24262f 40%,#1e1f26 100%)',
        'cp-hero': 'radial-gradient(circle at 25% 15%, rgba(174,99,228,0.25), transparent 60%), radial-gradient(circle at 80% 50%, rgba(14,190,255,0.18), transparent 65%), radial-gradient(circle at 35% 85%, rgba(71,207,115,0.18), transparent 60%), linear-gradient(#0d0d11,#0d0d11)'
      }
    }
  },
  plugins: [
    require('@tailwindcss/typography')
  ],
};