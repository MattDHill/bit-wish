import 'reflect-metadata'
import { createConnection } from 'typeorm'
import { start } from './main'
require('dotenv').config()

initializeDB().then(() => {
  start()
})

async function initializeDB () {
  await createConnection().catch(error => console.error(error))
}
