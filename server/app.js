const express = require('express')
const http = require('http')
var cors = require('cors')

const app = express()
const bodyParser = require('body-parser')
const path = require('path')
var xss = require('xss')

/*  */
var server = http.createServer(app)
var io = require('socket.io')(server)

app.use(cors())
app.use(bodyParser.json())

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(__dirname + '/build'))
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname + '/build/index.html'))
  })
}

app.set('port', process.env.PORT || 4001)
const connections = {}

io.on('connection', (socket) => {
  console.log(connections)
  socket.on('join-call', (clientPath) => {
    if (connections[clientPath] === undefined) {
      connections[clientPath] = {}
    }

    connections[clientPath][socket.id] = {}
    connections[clientPath][socket.id].accessTime = new Date()
    console.log(connections[clientPath])
    Object.keys(connections[clientPath]).forEach((userId) => {
      io.to(userId).emit('user-joined', socket.id, connections[clientPath])
    })
  })

  socket.on('signal', (toId, message) => {
    io.to(toId).emit('signal', socket.id, message)
  })

  socket.on('chat-message', (data, sender, clientPath) => {
    data = sanitizeString(data)
    sender = sanitizeString(sender)

    Object.keys(connections[clientPath]).forEach((clientId) => {
      io.to(clientId).emit(
        'chat-message',
        data,
        sender,
        socket.id
      )
    })
  })

  socket.on('disconnect', () => {
    let room = ''
    Object.keys(connections).forEach((clientRoom) => {
      if (!connections[clientRoom][socket.id]) return
      room = clientRoom
      delete connections[clientRoom][socket.id]
    })

    if (Object.keys(connections[room])?.length === 0) {
      delete connections[room]

      return
    }

    Object.keys(connections[room])?.forEach((userId) => {
      io.to(userId).emit('user-left', socket.id)
    })
  })
})

server.listen(app.get('port'), () => {
  console.log('listening on', app.get('port'))
})
