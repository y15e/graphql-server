'use strict'

import fs from 'fs'
import * as mongodb from 'mongodb'
import { ApolloServer } from 'apollo-server'
import moment from 'moment-timezone'
import gmail from './gmail'

// mongo
const dbName = 'listman'
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

  // MongoDB
  await client.connect()
  const db = client.db(dbName)
  const collection = db.collection('items')
  
  // Resolvers
  const resolvers = {
    Item: {
      __resolveType(item, context, info){
        if (item.subject) {
          return 'Gmail'
        } else {
          return 'ToDo'
        }
      }
    },
    Query: {
      
      item: async (parent, args, context, info) => {
        let item = await fetchItem(collection, args.id)
        return item
      },
      
      items: async (parent, args, context, info) => {
        console.log('[query]')
        console.dir(args)
        let items = await fetchItems(collection, args.filter)
        //console.dir(items, {depth:1});
        
        return items
      },
      
      lists: () => {
        return [
          {
            id: 'gmail',
            name: 'Gmail',
            icon: 'bi bi-envelope'
          },
          {
            id: 'todo',
            name: 'ToDo',
            icon: 'bi bi-clipboard-check'
          }
        ]
      },

      filters: (parent, args) => {
        console.log('[filters]')
        console.dir(args)
        return gmail.filters
        return [
          {
            id: 'inbox',
            name: 'Inbox',
            count: 10
          },
          {
            id: 'sent',
            name: 'Sent',
            count: 23
          },
          {
            id: 'all',
            name: 'All Mail',
            count: 234
          }
        ]
      }
      
    },
    Subscription: {
      items: {
        subscribe: async function * (parent, args) {
          console.log('[items.subscribe]')
          console.dir(args)
          const changeStreamIterator = collection.watch()
		  while (true) {
			const result = await changeStreamIterator.next()
			console.log('## changeStreamIterator.next()')
			console.dir(result, {depth:1})
            
            let items = await fetchItems(collection, args.filter)
			//console.dir(items, {depth:1})

            yield { items: items }
		  }
		}
      },
      item: {
        subscribe: async function * (parent, args) {
          console.log('[subscription]')
          console.dir(args)
          const changeStreamIterator = collection.watch()
		  while (true) {
			const result = await changeStreamIterator.next()
			console.log('## changeStreamIterator.next()')
			console.dir(result)
            
            let item = await fetchItem(collection, args.id)
            yield {
              item: item
            }
		  }
		}
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

async function fetchItem(collection, id) {
  
  // Query
  let query = {
    _id: id
  }
  console.log('# fetchItem')
  console.dir(query)
  
  // Find
  console.time('find')
  let doc = await collection.findOne(query)
  console.timeEnd('find')
  
  return convertForView(doc)
}

async function fetchItems(collection, filter) {

  let limit = 30
  let skip = filter.page ? limit * (filter.page-1) : 0
  
  // Query
  let query = {}
  //query['raw.labelIds'] = { $nin: ['TRASH'] }
  
  let filterId = filter.filter
  query = gmail.filters.find(elm => elm.id == filterId).query
  console.log('[config query]')
  console.dir(query)
  
  if (filter.subject) {
    query['converted.subject'] = new RegExp(filter.subject, 'i')
  }
  console.log('[mongo query]')
  console.dir(query)
            
  // Find
  console.time('find')
  let cursor = await collection.find(query)
  console.timeEnd('find')

  console.time('count')
  let count = await cursor.count()
  console.timeEnd('count')
  
  console.time('toarray')
  let docs = await cursor.sort([ [ 'converted.date', -1 ] ]).skip(skip).limit(limit).toArray()
  console.timeEnd('toarray')
  
  console.log('length: ' + docs.length)
  
  let items = docs.map(doc => convertForView(doc))
  
  // Pagenation
  let pagenation = {
    from: skip + 1,
    to: (skip + limit < count) ? (skip + limit) : count,
    total: count,
    hasPrev: (filter.page > 1),
    hasNext: (skip + limit < count)
  }
  
  return {
    items: items,
    pagenation: pagenation
  }
}

function convertForView(doc) {
  
  //console.dir(doc, {depth: null})
  
  let item = doc.converted
  let now = moment()
  let date = moment(item.date)
  let format = date.isSame(now, 'day') ? 'HH:mm' : 'MMM DD'
  
  item.date = date.utcOffset(9).format(format)
  item.labels = doc.raw.labelIds

  //console.log(typeof doc.raw.payload.parts)
  if (doc.raw.payload.parts) {
    
    //console.log('length: ' + doc.raw.payload.parts.length)
    item.body = ''
    doc.raw.payload.parts.forEach(part => {
      //console.dir(part)
      //console.log(typeof part.body.data)
      //console.log(part.mimeType)
      if (part.mimeType == 'text/html') {
        item.mimeType = 'text/html'
        if (typeof part.body.data == 'string') {
          let decoded = Buffer.from(part.body.data, 'base64').toString('utf8')
          item.body += decoded
        }
        /*
          message.html = sanitizeHtml(message.html, {
	      allowedTags: false,
	      allowedAttributes: false
	      })
        */
      }
    })
    
  } else {
    item.mimeType = doc.raw.payload.mimeType
    item.body = decodeBase64(doc.raw.payload.body.data)
  }
  
  //console.dir(item)
  
  return item
}

// Base64 decode
function decodeBase64(data) {
  return Buffer.from(data, 'base64').toString('utf8')
}

// datetime format
function convertDate(item) {
  
  let now = moment()
  let date = moment(item.date)
  let format = date.isSame(now, 'day') ? 'HH:mm' : 'MMM DD'
  
  item.dateShow = date.utcOffset(9).format(format)
  
  return item
}
