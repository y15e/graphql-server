'use strict'

import fs from 'fs'
import * as mongodb from 'mongodb'
import { ApolloServer } from 'apollo-server'
import emails from './emails'

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
  const changeStreamIterator = collection.watch()
  
  const resolvers = {
    
    Subscription: {
      emailAdded: {
        subscribe: async function * () {
		  while (true) {
			const result = await changeStreamIterator.next()
			console.log(result)
            if (result.operationType == 'insert') {
			  yield {
			    emailAdded: {
				  ...result.fullDocument.converted
			    }
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
        let emails = docs.map(doc => doc.converted)
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
