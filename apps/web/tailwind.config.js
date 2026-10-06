/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  presets: [
    require('@qabila/ui/tailwind.preset.js')
  ],
  theme: {
    extend: {
      maxHeight: {
        '[calc(100dvh-6rem)]': 'calc(100dvh - 6rem)',
        '[calc(100dvh-5rem)]': 'calc(100dvh - 5rem)',
        '[calc(100dvh-4rem)]': 'calc(100dvh - 4rem)',
        '[calc(100dvh-3rem)]': 'calc(100dvh - 3rem)',
        '[calc(100dvh-3rem)]': 'calc(100dvh - 2rem)',
      },
    },
  },
  plugins: [],
}
