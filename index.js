const fs = require('fs')
const path = require('path')
const http = require('http')
const socketio = require('socket.io')

const staticBasePath = './static'

const staticServe = (req, res) => {  

  const fileLoc =  path.join(path.resolve(staticBasePath), req.url)
  const stream = fs.createReadStream(fileLoc)

  stream.on('error', (error) => {
    res.writeHead(404, 'Not Found')
    res.write('404: File Not Found!')
    res.end()
  })

  res.statusCode = 200
  stream.pipe(res)
}

const httpServer = http.createServer(staticServe)
const io = socketio.listen(httpServer)
const state = {
  active: false,
  users: [],
  buzzes: []
}

// socket.io namespaces
const host = io.of('/host')
const user = io.of('/user')
const board = io.of('/board')

const pass = {
  '/host': null,
  '/user': null
}
const authorize = (socket, next) => {
  if (pass[socket.nsp.name] && socket.handshake.query.pass !== pass[socket.nsp.name]) {
    next(new Error('Authentication error'))
  } else {
    next()
  }
}
host.use(authorize)
user.use(authorize)

const activateBuzzer = (override) => {
  if (!state.active || override) {
    console.log('Activating buzzer')
    state.buzzes = [] // reset
    state.active = true
    user.emit('buzzer-activated')
    host.emit('buzzer-activated')
    board.emit('buzzer-activated')
  }
}

const deactivateBuzzer = (override) => {
  if (state.active || override) {
    console.log('Deactivating buzzer')
    state.active = false
    user.emit('buzzer-deactivated')
    host.emit('buzzer-deactivated')
    board.emit('buzzer-deactivated')
  }
}

board.on('connection', (socket) => {
  console.log('Board connected', socket.id)
  board.emit('current-state', state)

  socket.on('activate-buzzer', activateBuzzer)
  socket.on('deactivate-buzzer', deactivateBuzzer)
})

host.on('connection', (socket) => {
  console.log('Host connected', socket.id)
  socket.emit('current-state', state)

  socket.on('activate-buzzer', activateBuzzer)
  socket.on('deactivate-buzzer', deactivateBuzzer)

  socket.on('start-countdown', (data) => {
    console.log(`Starting countdown for ${data.sec} seconds`)
    state.active = (data.action !== 'activate-buzzer')
    user.emit('countdown-started', data)
    host.emit('countdown-started', data)
    board.emit('countdown-started', data)
  })

  socket.on('restart-event', () => {
    console.log('Restarting event')
    state.active = false
    state.users = []
    state.buzzes = []
    user.emit('event-restarted')
    host.emit('event-restarted')
    board.emit('event-restarted')
  })
})

user.on('connection', (socket) => {
  socket.on('user-connected', (name) => {
    console.log(`User ${name} connected`, socket.id)
    state.users.push(name)
    host.emit('user-joined', name)
    socket.uname = name
  })

  socket.on('buzz', () => {
    if (state.active) {
      state.buzzes.push(socket.uname)
      console.log(`Buzz from ${socket.uname}`)
      board.emit('user-buzzed', socket.uname)
      host.emit('user-buzzed', socket.uname)
    } else {
      console.log(`Inactive buzz from ${socket.uname}`)
    }
  })

  socket.on('disconnect', () => {
    state.users.splice(state.users.indexOf(socket.uname), 1)
    host.emit('current-state', state)
  })
})

httpServer.listen(81, '0.0.0.0', function() {
  console.log('Listening at: http://localhost:80')
})
