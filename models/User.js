const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
   
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false, 
    },

    avatar: {
      type: String,
      default: null,
    },

    

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },


    voteHistory: [
      {
        pollId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Poll",
          required: true,
        },
        choiceIndex: {
          type: Number,
          required: true,
        },
        votedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
