import { createContext, useContext } from 'react'
import { PresetSocket } from '../modules/store'

const context = createContext<PresetSocket>(null!)

export function useSocket() {
  return useContext(context)!
}

export function SocketProvider({
  socket,
  children
}: React.PropsWithChildren & { socket: PresetSocket }) {
  return <context.Provider value={socket}>{children}</context.Provider>
}
