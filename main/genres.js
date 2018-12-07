const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();
const { User } = require("../users");
const { Movie } = require("../movies");
const { Conversation } = require("../conversation/models");
const bodyParser = require("body-parser");
const jsonParser = bodyParser.json();
const uniqid = require("uniqid");
const socket = require("socket.io");

router.put("/popcorn", jsonParser, (req, res, next) => {
	const popcornerId = req.user.id;
	const popcornedId = req.body.userId;
	let _user;
	//5c0996bc2025921aeac5020b
	// look up the user who popcorned and check if the user they popcorned has already popcorned them
	User.findOne({ _id: popcornerId })
		.then(user => {
			_user = user;
			if (user.popcorned.find(id => id.toString() === popcornedId)) {
				Conversation.create({ matched: [popcornedId, popcornerId] }).then(
					conversation => {
						let chatroom = conversation._id;

						_user.popcorned = _user.popcorned.filter(
							userId => userId.toString() !== popcornedId
						);
						_user.matched.push({ _id: popcornedId, chatroom });
						return Promise.all([
							User.findOneAndUpdate(
								{ _id: popcornerId },
								{ popcorned: _user.popcorned, matched: _user.matched }
							),
							User.findOneAndUpdate(
								{ _id: popcornedId },
								{ $push: { matched: { _id: popcornerId, chatroom } } }
							)
						]);
					}
				);
			} else {
				return User.findOneAndUpdate(
					{ _id: popcornedId },
					{ $push: { popcorned: popcornerId } },
					{ new: true }
				);
			}
		})
		.then(() => res.sendStatus(204))
		.catch(err => next(err));
});

router.put("/:id", jsonParser, (req, res, next) => {
	let { id } = req.params;
	let updatedUser;

	if (req.user.id !== id) {
		let err = new Error("Hold up sir that is not your id");
		err.status = 401;
		next(err);
	}

	let { genres, movies } = req.body;

	if (genres) {
		User.findOneAndUpdate({ _id: id }, { genres: genres }, { new: true })
			.then(user => res.json(user.serialize()))
			.catch(err => {
				return next(err);
			});
	} else if (movies) {
		User.findByIdAndUpdate({ _id: id }, { movies: movies }, { new: true })
			.then(user => {
				updatedUser = user.serialize();
				return Movie.updateMany(
					{ _id: { $in: movies } },
					{ $push: { users: id } },
					{ new: true }
				);
			})
			.then(() => res.json(updatedUser))
			.catch(err => {
				return next(err);
			});
	} else {
		return next();
	}
});

router.get("/", (req, res, next) => {
	//Movie 1 Horror 5c08072ccdaa386f7851cbeb, Movie 2 Comedy 5c08072ccdaa386f7851cbf6
	//Movie 3 International 5c08072ccdaa386f7851cc14
	//Query Movie database for all the matching movies
	//Create dictionary of user id's
	//if userId appears more than 55% of the time capture User
	//(userIdDictionary[movies[i].users[j]] < proportion)

	let userIdDictionary = {};
	let ourMatches = [];

	let movies;
	let proportion;

	const { id } = req.user;
	User.findById(id)
		.then(user => {
			movies = user.movies;
			proportion = Math.ceil(movies.length * 0.55);
			return Movie.find({ _id: { $in: movies } }, { _id: 0, users: 1 });
		})
		.then(movies => {
			for (let i = 0; i < movies.length; i++) {
				for (let j = 0; j < movies[i].users.length; j++) {
					console.log(movies[i].users[j]);
					if (!userIdDictionary[movies[i].users[j]]) {
						userIdDictionary[movies[i].users[j]] = 1;
					} else {
						userIdDictionary[movies[i].users[j]]++;
					}
				}
			}
			console.log(userIdDictionary, "line 84");
			console.log(proportion, "line 85");
			for (let id in userIdDictionary) {
				if (userIdDictionary[id] >= proportion && id !== req.user.id) {
					ourMatches.push(id);
				}
			}
			return User.find({ _id: { $in: ourMatches } }).populate({
				path: "movies",
				select: "title poster"
			});
			// res.status(200).json({ matches: ourMatches });
		})
		.then(users => {
			console.log(users);
			let serializedUser = users.map(user => user.serialize());
			res.json(serializedUser);
		})
		.catch(err => {
			next(err);
		});
});

// Just returns a user's popcorns

router.get("/popcorn/:id", (req, res, next) => {
	const { id } = req.params;

	if (req.user.id !== id) {
		let err = new Error("Hold up sir that is not your id");
		err.status = 401;
		return next(err);
	}

	User.findOne({ _id: id })
		.populate({
			path: "popcorned",
			select: "username"
		})
		.then(user => {
			const { popcorned } = user;
			res.json(popcorned);
		})
		.catch(err => next(err));
});

router.get("/matches/:id", (req, res, next) => {
	let { id } = req.params;

	if (req.user.id !== id) {
		let err = new Error("Hold up sir that is not your id");
		err.status = 401;
		return next(err);
	}

	User.findOne({ _id: id }, { matches: 1 })
		.populate({ path: "matched", select: "username" })
		.then(matches => {
			res.status(200).json(matches);
		})
		.catch(err => next(err));
});

module.exports = { router };