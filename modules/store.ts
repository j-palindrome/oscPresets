import { produce } from 'immer'
import _ from 'lodash'
import { Socket } from 'socket.io-client'
import { createWithEqualityFn } from 'zustand/traditional'
import config from '../../../controls/src/config'

export type PresetValueDescription =
  | { type: 'slider'; default: number }
  | { type: 'boolean'; default: boolean }
  | { type: 'string'; default: string }
  | { type: 'trigger'; default: undefined }
  | { type: 'list'; default: number[] }
  | {
      type: 'select'
      default: string
      options: string[]
      display: 'menu' | 'dropdown'
    }
  | { type: 'xy'; default: [number, number]; bounds: [number, number] }

export type Schema = Record<string, PresetValueDescription>
export type SchemaPreset<T extends Schema> = {
  [K in keyof T]: Partial<Omit<T[K], 'type'>> & { value: T[K]['default'] }
}

export type AppState<T extends Schema> = {
  schema: T
  preset: SchemaPreset<T>
  presets: SchemaPreset<T>[]
  currentPreset: number
}

const createPresetFromSchema = <T extends Schema>(
  schema: T
): SchemaPreset<T> => {
  const schemaPreset = {} as SchemaPreset<T>
  for (let key of Object.keys(schema)) {
    ;(schemaPreset as any)[key] = { value: schema[key].default }
  }
  return schemaPreset
}

const createStateFromSchema = <T extends Schema>(schema: T): AppState<T> => {
  return {
    schema,
    preset: createPresetFromSchema(schema),
    presets: [],
    currentPreset: 0
  }
}
const initialState = createStateFromSchema(config)

export const useAppStore = createWithEqualityFn(() => initialState)

const modify = (modifier: (state: typeof initialState) => void) =>
  useAppStore.setState(produce(modifier))

export type PresetSocket = Socket<{}, SocketEvents<typeof config>>

export type SocketEvents<T extends Schema> = {
  do: <T extends { type: 'encode'; info: { timestamp: number } }>(
    type: T['type'],
    info: T['info']
  ) => void
  get: <
    T extends {
      type: 'path'
      info: { relativePath: string }
      callback: (path: string) => void
    }
  >(
    type: T['type'],
    info: T['info'],
    callback: T['callback']
  ) => void
  load: (callback: (presets: AppState<T>['presets']) => void) => void
  save: (presets: AppState<T>['presets']) => void
  osc: (target: 'max' | 'td' | 'all', path: string, ...value: any[]) => void
}

export const setters = {
  savePreset: (index: number, socket: PresetSocket) => {
    modify(state => {
      state.presets[index] = _.cloneDeep(state.preset)
      socket.emit('save', state.presets)
    })
  },
  deletePreset: (name: number, socket: PresetSocket) => {
    modify(state => {
      state.presets.splice(name, 1)
      socket.emit('save', state.presets)
    })
  },
  loadPreset: (name: number, socket: PresetSocket) => {
    const presets = getters.get('presets')
    const currentPreset = getters.get('preset')
    const newPreset = !presets[name]
      ? _.cloneDeep(currentPreset)
      : presets[name]

    setters.setPreset({ ...newPreset }, socket)

    modify(state => {
      state.currentPreset = name
    })
  },
  setPreset: (
    newPreset: Partial<SchemaPreset<typeof config>>,
    socket: PresetSocket,
    // when setting/getting these are useful for preventing infinite loops
    { commit = true, send: sendToMax = true } = {}
  ) => {
    if (sendToMax) {
      for (let key of Object.keys(newPreset)) {
        socket.emit('osc', 'all', key, newPreset[key])
      }
    }

    if (commit) {
      modify(state => {
        Object.assign(state.preset, newPreset)
      })
    }
  },
  set: (newState: Partial<AppState<typeof config>>) => modify(() => newState)
}

export const getters = {
  get: <T extends keyof AppState<typeof config>>(key: T) =>
    useAppStore.getState()[key]
}
