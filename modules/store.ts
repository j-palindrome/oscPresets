import { produce } from 'immer'
import _ from 'lodash'
import { createContext, useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { create } from 'zustand'

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
  [K in keyof T]: PresetValue<T[K]>
}
export type PresetValue<T extends PresetValueDescription> = T['default']
export type AppState<T extends Schema> = {
  schema: T
  preset: SchemaPreset<T>
  presets: SchemaPreset<T>[]
  currentPreset: number
}
export type PresetSocket<T extends Schema> = Socket<{}, SocketEvents<T>>
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

export const createStore = <T extends Schema>(schema: T) => {
  const initialState: AppState<T> = createStateFromSchema(schema)
  const useAppStore = create(() => initialState)

  const modify = (modifier: (state: AppState<T>) => void) =>
    useAppStore.setState(produce(modifier) as unknown)

  const setters = {
    savePreset: (index: number, socket: PresetSocket<T>) => {
      modify(state => {
        state.presets[index] = _.cloneDeep(state.preset)
        socket.emit('save', state.presets)
      })
    },
    deletePreset: (name: number, socket: PresetSocket<T>) => {
      modify(state => {
        state.presets.splice(name, 1)
        socket.emit('save', state.presets)
      })
    },
    loadPreset: (name: number, socket: PresetSocket<T>) => {
      const presets = useAppStore.getState()['presets']
      const currentPreset = useAppStore.getState()['preset']
      const newPreset = !presets[name]
        ? _.cloneDeep(currentPreset)
        : presets[name]

      setters.setPreset({ ...newPreset }, socket)

      modify(state => {
        state.currentPreset = name
      })
    },
    setPreset: (
      newPreset: Partial<SchemaPreset<T>>,
      socket: PresetSocket<T>,
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
    set: (newState: Partial<AppState<T>>) => modify(() => newState)
  }
  const context = createContext<PresetSocket<T>>(null!)
  const useSocket = () => {
    const [socket, setSocket] = useState<PresetSocket<T>>()

    useEffect(() => {
      const socket: PresetSocket<T> = io()
      setSocket(socket)

      socket.emit('load', presets => {
        setters.set({
          presets
        })
      })

      return () => {
        socket.close()
      }
    }, [])

    return socket
  }

  return { useAppStore, setters, context, useSocket }
}

export type Store<T extends Schema> = ReturnType<typeof createStore<T>>
