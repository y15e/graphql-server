'use strict'

import fs from 'fs'
import { ApolloServer } from 'apollo-server'
import emails from './emails'

const typeDefs = fs.readFileSync('./schema.graphql', 'utf8');

(async () => {
  

  const resolvers = {
    Subscription: {
      emailAdded: {
      }
    },
    Query: {
      emails: () => emails
    }
  };

  const server = new ApolloServer({
    typeDefs,
    resolvers
  });

  server.listen().then(({ url }) => {
    console.log(`Server ready at ${url}`);
  });

})()
