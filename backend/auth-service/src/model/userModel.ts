import mongoose, { Document, Schema } from 'mongoose';

// A user record is created on first GitHub login and updated on subsequent logins.
// githubId is the stable identifier — email and username can change on GitHub.
interface IUser extends Document {
  githubId:   string;   // GitHub numeric user ID — never changes
  username:   string;   // GitHub login handle
  email:      string;   // primary email from GitHub profile
  avatarUrl:  string;   // GitHub avatar URL
  createdAt:  Date;
  updatedAt:  Date;
}

const UserSchema = new Schema<IUser>(
  {
    githubId:  { type: String, required: true, unique: true },
    username:  { type: String, required: true },
    email:     { type: String, required: true },
    avatarUrl: { type: String, required: true },
  },
  {
    collection: 'users',
    timestamps: true,
  }
);

const UserModel = mongoose.model<IUser>('User', UserSchema);

export { UserModel, IUser };