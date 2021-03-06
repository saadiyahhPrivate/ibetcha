var MILLIS_IN_A_DAY = 24*60*60*1000;
var mongoose = require("mongoose"),
	Schema = mongoose.Schema;
	ObjectId = mongoose.Schema.ObjectId;
var User = require('./User');
var Milestone = require('./Milestone');
var MonitorRequest = require('./MonitorRequest');


// Checks for model statuses
var betStatus = [
	'Not Started', //before startDate
	'Action Required', // (btw startDate and dropDate)requires action from monitors, does not count towards rating
	'Succeeded', // anytime between endDate and dropDate; contributes 5 points to rating

	'Failed',  // anytime between startDate and dropDate; contributed 1 point to rating
	'Dropped', // until startDate (not enough mentors),
			   // after dropDate (if still "Action Required")
			   //failed to get required action within time period, does not count towards rating	
];

//========================== SCHEMA DEFINITION ==========================
var betSchema = new Schema({
	startDate: Date, //Date stored in UTC format
	endDate: Date,
	frequency: Number,
	description: String,
	dropDate: Date, // date after which no checkoffs are accepted anymore: 
					// bet is dropped if all action is not done by this date
					//user does not lost his money in this case

	author:{
		type: ObjectId,
		ref: 'User'
	},

	monitors: [{
		type: ObjectId,
		ref: 'User'
	}],

	status:{
		type: String,
		enum: betStatus
	},
	
	amount:{
		type: Number
	},

	milestones:[{
		type: ObjectId,
		ref: 'Milestone'
	}]
});

//=========================== HELPERS ===============================

/*
Check bet data before entering it to the DB
*/
var validateBetData = function(data){
	var validation = "valid";

	if (!data.endDate || !data.startDate || !data.description || !data.frequency || !data.monitors || !data.amount) {
		validation = "Please fill in all the required fields.";
	} else if (data.amount < 5) {
		validation = "Amount should be at least $5."
	} else if (data.amount > 100){
		validation = "Amount could be at most $100."
	} else if (data.monitors.length < 3) {
			validation = "Please invite at least 3 monitors!";
	} 

    var result = true;
    var startDate = (new Date(data.startDate)).valueOf();
    var endDate = (new Date(data.endDate)).valueOf();
    var result = (startDate < endDate);
    var result = ((Math.ceil((endDate-startDate)/MILLIS_IN_A_DAY)) > data.frequency);
    if (!result) {
    	validation = "Please make sure that end date, start date and frequency are consistent!";
    } 

    return validation;
}

/*
Handle the logic of generating milestone JSONs (note that this does not save the milestones)
*/
function generate_milestones(userID, betID, startDate, endDate, frequency) {
	var milestones_array = [];
	var start_date = new Date(startDate);
	var end_date = new Date(endDate);

	// number of milestones to create at intervals
	var total_num_days = ((end_date.valueOf() - start_date.valueOf()) / MILLIS_IN_A_DAY);
	var num_milestones = Math.floor(total_num_days / frequency);
	var my_date = start_date;
	var days_to_add_to_next_milestone = frequency;
	var add_end_date = total_num_days % frequency; // 0 if no days left over, other if some day remaining
	var current_date = new Date(start_date.valueOf());

	milestones_array = makeMilestones(num_milestones, days_to_add_to_next_milestone, start_date, betID, userID);

	//edge case for end date
	if (makeMilestOnEndDate(add_end_date)) {
		var end_date_milestone = makeOneMilestone(end_date, betID, userID);
		milestones_array.push(end_date_milestone);
	}
	
	return milestones_array;
}

// return a JSON for a milestone on the end date
var makeOneMilestone = function(date, betID, userID) {
	return {
		date: date,
		bet: betID,
		author: userID,
		status: "Inactive",
		monitors: []
	};
}

// Make an array of milestones at the given frequency from the start date to end date/ before end date
var makeMilestones = function(num_milestones, days_to_add_to_next_milestone, start_date, betID, userID) {
	var milestones = [];
	for (i = 0; i <= num_milestones; i++) { //note we start at i=0 so we have a milestone on day 1
		current_date = new Date(start_date.valueOf() + (i * days_to_add_to_next_milestone) * MILLIS_IN_A_DAY);
		var current_milestone = makeOneMilestone(current_date, betID, userID);
		milestones.push(current_milestone);
	}
	return milestones;
}

// e.g. if frequency is 2 days, and the bet duration is 5 days, 
//we have one day left over after the milestone on day 4.
// we need to make a final milestone for the last day(day 5).
var makeMilestOnEndDate = function(add_end_date) {
	return ((add_end_date) !== 0); 
}

//transforms the data into JSON format for bet creation
var make_bet_JSON = function(data, userId){
	var status = "Not Started";
	var endDate = new Date(data.endDate);
	var dropDate = new Date(endDate.valueOf()+10*MILLIS_IN_A_DAY);
	var monitors = [];
	//window of 10 days after bet ends to check off
	var betJSON = {
		author: userId,
		startDate: data.startDate,
		endDate: data.endDate,
		dropDate: dropDate,
		frequency: data.frequency,
		description: data.description,
		status: status,
		milestones: [],
		amount: data.amount,
		monitors: []
	};
	return [betJSON, endDate, dropDate]
}

/*
Insert milestones into the bets
*/
var store_all_milestones = function(MilestonesArray, betId, responseCallback, res) {
	Bet.findOne({
		_id: betId
	}, function(err, bet) {
		if (err) {
			responseCallback(true, 500, err, res);
		}
		Milestone.create(MilestonesArray, function(err) {
			if (err) {
				responseCallback(true, 500, "Cannot post milestones to database", res)
			} else {
				saveMilestonesIntoBet(bet, arguments, responseCallback, res);
			}
		});
	});
}

// Goes through milestones and saves them into the bet
var saveMilestonesIntoBet = function(bet, arguments, responseCallback, res) {
	for (var i = 1; i < arguments.length; ++i) {
		bet.milestones.push(arguments[i]._id);
	}
	
	bet.save(function(err) {
		if (err) {
			responseCallback(true, 500, "Cannot post milestones to database", res);
		} else {
			responseCallback(false, 200, bet, res);
		}
	});
}

//========================== SCHEMA STATICS ==========================

// Correctly populate nested fields and return the current user's bet
betSchema.statics.getCurrentUserBets = function(user, responseCallback, res) {
	// populate the user bets milestones
	Bet.populate([user.bets], {"path":"milestones"}, function (err, output) {
		if (err) {
			responseCallback(true, 500, 'There was an error!', res);
		} else {
			user.bets = output;
			// populate the author of the monitoring bets
			Bet.populate([user.monitoring], {"path": "author" }, function (err, updatedBets) {
	            if (err) {
	                responseCallback(true, 500, 'There was an error!', res);
	            } else {
	                user.monitoring = updatedBets;
	                MonitorRequest.populateMonitorRequest({ to: user._id }, 'to from bet', user, responseCallback, res);
	            }
            });
		}
	});
};

// Custom populate method for Bet object
betSchema.statics.populateBet = function(populate, path, callback, responseCallback, res) {
	Bet.populate(populate, path, function(err, output) {
		if (err) {
			responseCallback(true, 500, "There was an error", res);
		} else {
			populate[0] = output;
			callback;
		}
	});
}

// Creates a bet in the database and sends monitor requests for people who were requested
betSchema.statics.create = function(data, responseCallback, res){
	if (data.test){
		//add three dummy monitors
		data.monitors = [mongoose.Types.ObjectId(),mongoose.Types.ObjectId(),mongoose.Types.ObjectId()];
	}
	var validation = validateBetData(data);
	if (validation !== "valid"){
    	responseCallback(true, 500, validation, res);
    } else {
		var userId = data.userId;
		var bet_data_extractor = make_bet_JSON(data, userId);
		var betJSON = bet_data_extractor[0];
		var endDate = bet_data_extractor[1];
		var dropDate = bet_data_extractor[2];
		var newBet = new Bet(betJSON);	  

		newBet.save(function(err, bet){
		    if (err){
		      responseCallback(true, 500, err, res);
		    }
		    else{

		        mongoose.model('User').findById(userId, function (err, user) {
		            if (err){
		                responseCallback(true, 401, 'There was an error!', res);
		            } else if (user === null){
		                responseCallback(true, 500, 'No user found!', res);
		            } else {
		            	var betId = bet._id;
		                user.bets.push(betId);
		                var monitors = data.monitors || [];
				        var monitorRequestArray = generateMonitorRequestArray(userId, betId, monitors);

				        saveMonitorsForUser(user, monitorRequestArray, createMonitorRequestsForMilestones, responseCallback, 
				        	                userId, betId, data, res); // extra params for the callback function
		            }
		        });
		    }
		});
	}
}

// Update the user with monitors info
var saveMonitorsForUser = function(user, monitorRequestArray, callback, responseCallback, userId, betId, data, res) {
	user.save(function(err, newUser) {
		if (err) {
			responseCallback(true, 500, 'There was an error!', res);
		} else {
			callback(monitorRequestArray, userId, betId, data, responseCallback, res);
		}
	});
}

// Create the MonitorRequest objects from the monitorRequest array and then make/store milestones
var createMonitorRequestsForMilestones = function(monitorRequestArray, userId, betId, data, responseCallback, res) {
	MonitorRequest.create(monitorRequestArray, function(err, requests) {
        if (err) {
            callback(true, 500,'There was an error', res);
        } else {
            var milestones_JSONs = generate_milestones(userId, betId, data.startDate, data.endDate, data.frequency);
            store_all_milestones(milestones_JSONs, betId, responseCallback, res);
        }
    });
}

// Generate MonitorRequest objects array
var generateMonitorRequestArray = function(userId, betId, monitors) {
	monitorRequests = [];
	for (i = 0; i < monitors.length; i++) { 
		monitorRequests.push(generateSingleMonitorRequest(userId, betId, monitors[i]));
	}
	return monitorRequests;
}

// Given userId, betId, and monitor, return the MonitorRequest object
var generateSingleMonitorRequest = function(userId, betId, monitor) {
	return {
		from: userId,
		to: monitor,
		bet: betId
	};
}

//Bindings
var Bet = mongoose.model('Bet', betSchema);

module.exports = Bet;
