import { useState, useRef, useEffect } from 'react'
import './App.css'
import io from 'socket.io-client'

let mic = false
let vid = false
let connections = {}
let socketId = ''

var silence = () => {
  let ctx = new AudioContext()
  let oscillator = ctx.createOscillator()
  let dst = oscillator.connect(ctx.createMediaStreamDestination())
  oscillator.start()
  ctx.resume()
  return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false })
}

var black = ({ width = 640, height = 480 } = {}) => {
  let canvas = Object.assign(document.createElement('canvas'), {
    width,
    height,
  })
  canvas.getContext('2d').fillRect(0, 0, width, height)
  let stream = canvas.captureStream()
  return Object.assign(stream.getVideoTracks()[0], { enabled: false })
}

function App() {
  const videoRef = useRef()
  let socket = null
  const peerConnectionConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  }

  useEffect(() => {
    getPermissions()
  }, [])

  const getPermissions = async () => {
    await navigator.mediaDevices
      .getUserMedia({ video: true })
      .then(() => (vid = true))
      .catch(() => (vid = false))
    await navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(() => (mic = true))
      .catch(() => (mic = false))

    if (!vid && !mic) return
    navigator.mediaDevices
      .getUserMedia({
        video: vid,
        audio: mic,
      })
      .then((stream) => {
        window.localStream = stream
        videoRef.current.srcObject = stream
      })
  }

  const getUserMedia = () => {
    if (mic || vid) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then(getUserMediaSuccess)
        .then((stream) => {})
        .catch((e) => console.log(e))
    } else {
      try {
        let tracks = videoRef.current.srcObject.getTracks()
        tracks.forEach((track) => track.stop())
      } catch (e) {}
    }
  }

  const getUserMediaSuccess = (stream) => {
    try {
      window.localStream.getTracks().forEach((track) => track.stop())
    } catch (e) {
      console.log(e)
    }

    window.localStream = stream
    videoRef.current.srcObject = stream

    for (let id in connections) {
      if (id === socketId) continue

      connections[id].addStream(window.localStream)

      connections[id].createOffer().then((description) => {
        connections[id]
          .setLocalDescription(description)
          .then(() => {
            socket.emit(
              'signal',
              id,
              JSON.stringify({ sdp: connections[id].localDescription })
            )
          })
          .catch((e) => console.log(e))
      })
    }
  }

  const gotMessageFromServer = (fromId, message) => {
    if (fromId === socketId) return
    
    var signal = JSON.parse(message)
    if (signal.sdp) {
      connections[fromId]
        .setRemoteDescription(new RTCSessionDescription(signal.sdp))
        .then(() => {
          if (signal.sdp.type === 'offer') {
            connections[fromId]
              .createAnswer()
              .then((description) => {
                connections[fromId]
                  .setLocalDescription(description)
                  .then(() => {
                    socket.emit(
                      'signal',
                      fromId,
                      JSON.stringify({
                        sdp: connections[fromId].localDescription,
                      })
                    )
                  })
                  .catch((e) => console.log(e))
              })
              .catch((e) => console.log(e))
          }
        })
        .catch((e) => console.log(e))
    }

    if (signal.ice) {
      connections[fromId]
        .addIceCandidate(new RTCIceCandidate(signal.ice))
        .catch((e) => console.log(e))
    }
  }

  const connectSocket = () => {
    socket = io.connect('http://localhost:4001', { secure: true })

    socket.on('signal', gotMessageFromServer)

    socket.on('connect', () => {
      socket.emit('join-call', window.location.href)
      socketId = socket.id

      socket.on('user-left', (id) => {
        console.log('user-left')
        let video = document.querySelector(`[data-socket="${id}"]`)
        if (video !== null) {
          video.parentNode.removeChild(video)
        }
      })

      socket.on('user-joined', (id, clients) => {
        Object.keys(clients).forEach((clientId) => {
          connections[clientId] = new RTCPeerConnection(peerConnectionConfig)

          connections[clientId].onicecandidate = (event) => {
            if (event.candidate != null) {
              socket.emit(
                'signal',
                clientId,
                JSON.stringify({ ice: event.candidate })
              )
            }
          }

          connections[clientId].onaddstream = (event) => {
            console.log('on add stream', event)
            const searchVid = document?.querySelector(
              `[data-socket="${clientId}"]`
            )
            if (searchVid !== null) {
              searchVid.srcObject = event.stream

              return
            }
            let app = document.getElementById('app')
            let video = document.createElement('video')
            video.classList.add('video')
            video.setAttribute('data-socket', clientId)
            video.srcObject = event.stream
            video.autoplay = true
            video.playsinline = true

            app.appendChild(video)
          }

          if (window.localStream !== undefined && window.localStream !== null) {
            connections[clientId].addStream(window.localStream)
          } else {
            let blackSilence = (...args) =>
              new MediaStream([black(...args), silence()])
            window.localStream = blackSilence()
            connections[clientId].addStream(window.localStream)
          }
        })

        if (id === socket.id) {
          for (let id2 in connections) {
            if (id2 === socket.id) continue

            try {
              connections[id2].addStream(window.localStream)
            } catch (e) {}

            connections[id2].createOffer().then((description) => {
              connections[id2]
                .setLocalDescription(description)
                .then(() => {
                  socket.emit(
                    'signal',
                    id2,
                    JSON.stringify({ sdp: connections[id2].localDescription })
                  )
                })
                .catch((e) => console.log(e))
            })
          }
        }
      })
    })
  }

  const connect = async () => {
    await connectSocket()
  }

  return (
    <>
      <button
        onClick={() => {
          connect()
        }}
      >
        Connect
      </button>
      <div className='App' id='app'>
        <video
          id='my-video'
          ref={videoRef}
          autoPlay
          muted
          style={{
            borderStyle: 'solid',
            borderColor: '#bdbdbd',
            margin: '30px auto',
            objectFit: 'fill',
            width: '500px',
            height: '500px',
          }}
        ></video>
      </div>
    </>
  )
}

export default App
