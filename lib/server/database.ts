import 'server-only';
import mongoose, { type Mongoose } from 'mongoose';

const runtime = globalThis as typeof globalThis & { restaurantMongo?: Promise<Mongoose> };

export function databaseConfigured() {
  return Boolean(process.env.MONGODB_URI?.trim());
}

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('MongoDB has not been configured.');
  runtime.restaurantMongo ??= mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB?.trim() || 'sweet_rascal',
    maxPoolSize: 5,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 10000,
    autoIndex: false,
  }).catch(error => {
    runtime.restaurantMongo = undefined;
    throw error;
  });
  return runtime.restaurantMongo;
}
