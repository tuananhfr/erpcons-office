import nextVitals from 'eslint-config-next/core-web-vitals'

const config = [
  { ignores: ['out/**', '.next/**', 'src/generated/**', '.superpowers/**'] },
  ...nextVitals,
]

export default config
