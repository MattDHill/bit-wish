import 'reflect-metadata'
import { createConnection } from 'typeorm'
import { start } from './main'

initializeDB().then(() => {
  start()
})

async function initializeDB () {
  await createConnection().catch(error => console.error(error))
}
