import antfu from '@antfu/eslint-config'

export default antfu({
  react: false,
  typescript: true,
  ignores: ['dist', 'src-tauri/target', 'src-tauri/gen'],
})
