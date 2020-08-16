'use strict'

import fs from 'fs'
import * as mongodb from 'mongodb'
import { ApolloServer } from 'apollo-server'
import emails from './emails'
import moment from 'moment-timezone'

// mongo
const dbName = 'stream-test'
const mongoUrl = 'mongodb://localhost:27018/' + dbName
      + '?readPreference=secondaryPreferred'
const mongoOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true
}

const MongoClient = mongodb.MongoClient
const client = new MongoClient(mongoUrl, mongoOptions)

const typeDefs = fs.readFileSync('./schema.graphql', 'utf8');

(async () => {

  await client.connect()

  const db = client.db(dbName)
  const collection = db.collection('items')
  
  const resolvers = {
    
    Subscription: {
      emailAdded: {
        subscribe: async function * () {
          const changeStreamIterator = collection.watch()
		  while (true) {
			const result = await changeStreamIterator.next()
			console.log(result)
            if (result.operationType == 'insert') {
			  yield {
			    emailAdded: convertDate(result.fullDocument.converted)
			  }
            }
		  }
		}
      }
    },
    
    Query: {
      emails: async () => {
        let cursor = await collection.find()
        let docs = await cursor.sort([ [ 'converted.date', -1 ] ]).toArray()
        let emails = docs.map(doc => convertDate(doc.converted))
        return emails
      }
    }
  };

  const server = new ApolloServer({
    typeDefs,
    resolvers
  });

  server.listen().then(({ url, subscriptionsUrl }) => {
    console.log(`Server ready at ${url}`);
    console.log(`Subscriptions ready at ${subscriptionsUrl}`);
  });

})()

// datetime format
function convertDate(item) {
  
  let now = moment()
  let date = moment(item.date)
  //let format = (now.diff(date) < 86400000) ? 'HH:mm' : 'MMM DD'
  let format = date.isSame(now, 'day') ? 'HH:mm' : 'MMM DD'
  
  item.date = date.utcOffset(9).format(format)
  
  return item
} 