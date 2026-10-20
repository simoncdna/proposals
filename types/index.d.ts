export type Editing = boolean

declare module 'claude-code' {
  interface PluginState {
    proposals: { isEditing: Editing }
  }
}
