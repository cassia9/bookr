/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // === 中性色 (Neutrals) ===
        white: '#FFFFFF',
        surface: '#F9F9F9',
        'surface-secondary': '#F0F0F0',
        border: '#E5E5E5',
        divider: '#D1D1D6',
        disabled: '#ADADB0',
        'text-secondary': '#8A8A8E',
        'text-primary': '#424245',
        black: '#000000',

        // === 主色 (Primary - Black) ===
        primary: '#000000',
        'primary-hover': '#1A1A1A',
        'primary-active': '#333333',
        'primary-disabled': '#D1D1D6',

        // === 輔助色 (Accent - Beige) ===
        accent: '#D4A574',
        'accent-hover': '#C89660',
        'accent-light': '#EDD5C0',
        'accent-lightest': '#F5EAE0',

        // === 語義色 (Semantic) ===
        success: '#34C759',
        'success-light': '#D1EFCC',
        warning: '#FF9500',
        'warning-light': '#FFE5CC',
        danger: '#FF3B30',
        'danger-light': '#FFD1CC',
        info: '#0084FF',
        'info-light': '#CCE5FF',
      },

      boxShadow: {
        'none': 'none',
        'xs': '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'sm': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -1px rgba(0, 0, 0, 0.05)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.10), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        'inner': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
        'inner-sm': 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
      },

      spacing: {
        '0': '0px',
        'xs': '4px',     // 0.5x
        'sm': '8px',     // 1x
        'md': '12px',    // 1.5x
        'lg': '16px',    // 2x
        'xl': '24px',    // 3x
        '2xl': '32px',   // 4x
        '3xl': '48px',   // 6x
        '4xl': '64px',   // 8x
      },

      borderRadius: {
        'none': '0px',
        'xs': '4px',
        'sm': '8px',
        'md': '12px',
        'lg': '16px',    // 主要使用
        'xl': '20px',
        'full': '9999px',
      },

      fontSize: {
        // 按照設計系統的類型尺度
        'xs': ['11px', { lineHeight: '1.4' }],       // Label
        'sm': ['12px', { lineHeight: '1.5' }],       // Small
        'base': ['14px', { lineHeight: '1.5' }],     // Body
        'md': ['16px', { lineHeight: '1.5' }],       // Subtitle
        'lg': ['20px', { lineHeight: '1.4' }],       // Title
        'xl': ['24px', { lineHeight: '1.35' }],      // Headline 2
        '2xl': ['28px', { lineHeight: '1.3' }],      // Headline 1
        '3xl': ['32px', { lineHeight: '1.25' }],     // Display
      },

      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"Helvetica Neue"',
          'sans-serif',
        ],
        mono: [
          'Menlo',
          'Monaco',
          '"Courier New"',
          'monospace',
        ],
      },

      fontWeight: {
        light: '300',
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },

      boxShadow: {
        none: 'none',
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
        base: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
        md: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
        lg: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        xl: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      },

      transitionDuration: {
        fast: '150ms',
        normal: '250ms',
        slow: '350ms',
      },

      transitionTimingFunction: {
        'ease-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'ease-in': 'cubic-bezier(0.4, 0, 0.6, 1)',
        'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },

      scale: {
        '102': '1.02',
        '98': '0.98',
      },

      minHeight: {
        'touch': '44px',  // 最小觸碰目標
      },

      minWidth: {
        'touch': '44px',  // 最小觸碰目標
      },
    },
  },

  plugins: [
    // 自定義 Tailwind 插件
    function ({ addComponents, theme }) {
      addComponents({
        // === 按鈕組件類別 ===
        '.btn': {
          '@apply': 'px-4 py-2.5 rounded-md font-medium transition-all duration-fast ease-out inline-flex items-center justify-center gap-2',
        },

        '.btn-primary': {
          '@apply': 'bg-black text-white hover:bg-primary-hover active:scale-98 disabled:bg-border disabled:text-disabled disabled:cursor-not-allowed',
        },

        '.btn-secondary': {
          '@apply': 'bg-surface-secondary text-text-primary border border-border hover:bg-border active:scale-98 disabled:bg-surface disabled:text-disabled',
        },

        '.btn-danger': {
          '@apply': 'bg-danger text-white hover:bg-red-600 active:scale-98 disabled:bg-border disabled:text-disabled',
        },

        '.btn-ghost': {
          '@apply': 'bg-transparent text-text-primary border border-border hover:bg-surface active:scale-98 disabled:text-disabled',
        },

        '.btn-small': {
          '@apply': 'px-3 py-2 text-xs rounded-md',
        },

        '.btn-large': {
          '@apply': 'px-6 py-3 text-base rounded-lg',
        },

        // === 卡片組件類別 ===
        '.card': {
          '@apply': 'bg-white border border-border rounded-lg p-lg shadow-sm hover:shadow-md transition-shadow duration-normal',
        },

        // === 輸入框組件類別 ===
        '.input': {
          '@apply': 'w-full px-4 py-2.5 rounded-md border border-border bg-white text-text-primary text-base placeholder-text-secondary focus:outline-none focus:border-black focus:ring-2 focus:ring-black/5 transition-all duration-fast',
        },

        '.input:disabled': {
          '@apply': 'bg-surface-secondary text-text-secondary cursor-not-allowed',
        },

        '.input-error': {
          '@apply': 'border-danger focus:border-danger focus:ring-danger/10',
        },

        // === 標籤組件類別 ===
        '.badge': {
          '@apply': 'inline-flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs font-medium',
        },

        '.badge-success': {
          '@apply': 'bg-success-light text-success',
        },

        '.badge-warning': {
          '@apply': 'bg-warning-light text-warning',
        },

        '.badge-danger': {
          '@apply': 'bg-danger-light text-danger',
        },

        // === 焦點狀態 ===
        '.focus-ring': {
          '@apply': 'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black',
        },

        // === 文字色彩 ===
        '.text-primary': {
          '@apply': 'text-text-primary',
        },

        '.text-secondary': {
          '@apply': 'text-text-secondary',
        },

        // === 背景色彩 ===
        '.bg-primary': {
          '@apply': 'bg-surface',
        },

        '.bg-secondary': {
          '@apply': 'bg-surface-secondary',
        },
      });
    },
  ],
};
