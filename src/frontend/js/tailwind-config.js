tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['JetBrains Mono', 'monospace'],
                display: ['JetBrains Mono', 'monospace'],
                mono: ['JetBrains Mono', 'monospace'],
            },
            colors: {
                black: '#0a0a0a',
                zinc: {
                    850: '#202023',
                    900: '#18181b',
                    925: '#121214',
                    950: '#09090b',
                },
                indigo: {
                    400: '#818cf8',
                    500: '#6366f1',
                    600: '#4f46e5',
                }
            },
            boxShadow: {
                'glow': '0 0 20px -5px rgba(99, 102, 241, 0.4)',
                'glow-sm': '0 0 10px -3px rgba(99, 102, 241, 0.3)',
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'flash': 'flash 1.5s ease-out forwards',
            },
            keyframes: {
                flash: {
                    '0%': { backgroundColor: 'rgba(99, 102, 241, 0.2)' },
                    '100%': { backgroundColor: 'transparent' },
                }
            }
        }
    }
}
