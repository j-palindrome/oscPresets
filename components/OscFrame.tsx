import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { PresetSocket, setters } from '../modules/store'
import { SocketProvider } from './context'
import '../dist.css'

export function OscFrame({ children }: React.PropsWithChildren) {
  const [socket, setSocket] = useState<PresetSocket>()

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const audioInputs = devices.filter(device => device.kind === 'audioinput')
      console.log('Available audio inputs:', audioInputs)
    })
  }, [])

  useEffect(() => {
    const socket: PresetSocket = io()
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

  return socket && <SocketProvider socket={socket}>{children}</SocketProvider>
}
