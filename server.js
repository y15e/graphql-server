const fs = require('fs');

const { ApolloServer } = require('apollo-server');

const emails = require('./emails');

const typeDefs = fs.readFileSync('./schema.graphql', 'utf8');

const resolvers = {
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