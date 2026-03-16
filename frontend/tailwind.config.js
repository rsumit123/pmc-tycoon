module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // PMC Tycoon — Classified Dossier palette
        dossier: {
          base: '#0C0E12',
          surface: '#151820',
          raised: '#1C1F2A',
          overlay: '#222633',
        },
        accent: {
          amber: '#D4A843',
          'amber-dim': '#9A7A35',
          red: '#C4453C',
          'red-dim': '#8B3330',
          blue: '#5B8BA0',
          'blue-dim': '#3E6478',
          green: '#5C8A4D',
          'green-dim': '#3F6236',
        },
        ink: {
          DEFAULT: '#D8D4CC',
          secondary: '#8A857C',
          muted: '#5A5650',
          faint: '#3A3730',
        },
        border: {
          DEFAULT: '#252830',
          subtle: '#1E2028',
        },
      },
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'system-ui', 'sans-serif'],
        data: ['"JetBrains Mono"', '"Fira Code"', '"Courier New"', 'monospace'],
      },
    },
  },
  plugins: [],
}
