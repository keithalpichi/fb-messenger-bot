const Task = require('../db/task')
const { sendResponse, verifyAuth, constructResponse, HELP_MSG } = require('../utils')

module.exports.indexGet = (req, res) => res.sendStatus(200)

module.exports.fbGet = (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge'])
  } else {
    console.error('Unauthorized FB token')
    res.sendStatus(200)
  }
}

module.exports.fbPost = (req, res) => {
  const data = req.body
  if (data.object === 'page') {
    data.entry.forEach(entry => {
      entry.messaging.forEach(event => {
        if (event.message) {
          handleMessageRequest(event)
        }
      })
    })
  }
  res.sendStatus(200)
}

const handleMessageRequest = event => {
  const senderID = event.sender.id
  return verifyAuth(senderID)
  .then(() => buildResponseFromRequest(event))
  .then(resp => sendResponse(resp))
}

// To-Do: Function is too long. Will need to break this out into separate functions for each if-statement
const buildResponseFromRequest = event => {
  const text = event.message.text
  const senderID = event.sender.id
  if (text.match('ADD')) {
    const request = text.match(/ADD (.*)/)[1]
    return Task.insertTask({ user_id: senderID, description: request })
    .then(() => {
      return constructResponse({ senderID: senderID, text: `To-do item “${request}” added to list.` })
    })
  } else if (text.match('LIST DONE')) {
    return Task.selectCompletedTasks({ user_id: senderID })
    .then(tasks => {
      if (!tasks.length) {
        return constructResponse({ senderID: senderID, text: 'You do not have any completed items. Use HELP for instructions' })
      } else {
        return constructResponse({ senderID: senderID, text: formatListResponse(tasks, `You have ${tasks.length} item marked as done:`, true) })
      }
    })
  } else if (text.match('LIST')) {
    return Task.selectTasks({ user_id: senderID })
    .then(tasks => {
      if (!tasks.length) {
        return constructResponse({ senderID: senderID, text: 'You do not have any items. Use HELP for instructions to create one' })
      } else {
        return constructResponse({ senderID: senderID, text: formatListResponse(tasks, `You currently have ${tasks.length} to-do items:`) })
      }
    })
  } else if (text.match(/#(.) DONE/)) {
    const taskID = parseInt(text.match(/#(.) DONE/)[1])
    return Task.markAsComplete({ id: taskID })
    .then(task => {
      if (task) {
        return constructResponse({ senderID: senderID, text: `To-do item ${taskID} (“${task.description}") marked as done.` })
      } else {
        return constructResponse({ senderID: senderID, text: `You do not have an item with id ${taskID} to mark as complete. Use HELP for instructions` })
      }
    })
  } else {
    const response = constructResponse({ senderID: senderID, text: HELP_MSG })
    return Promise.resolve(response)
  }
}

const formatListResponse = (data, botMessage, showCompleted = false) => {
  const tasks = data.map((task, i) => {
    const msg = `#${task.id}: ${task.description}`
    return showCompleted ? `${msg} completed (${task.date_modified.toUTCString()})` : msg
  })
  return [botMessage].concat(tasks).join('\n')
}
