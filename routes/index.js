var express = require('express');
var router = express.Router();
var passport = require('passport');

//linking collections and utils
var utils = require('../utils/utils');

var User = require('../models/User');
var Bet = require('../models/Bet');
var Milestone = require('../models/Milestone');

/* GET home page. */
router.get('/', function(req, res) {

  res.render('index', { title: 'Express test 2' });


});

router.get('/auth/venmo', function(req, res, next) {
	console.log(req);
	passport.authenticate('signup', function(err, newUser, info) {
		if (err) {
            res.status(500).json({ error: "There was an error!", success: false });
        } else if (!newUser){
            res.json(info);
        } else {
            req.logIn(newUser, function(err) {
              if (err) { 
                    res.status(500).json({ error: "There was an error!", success: false });
              } else {
                    res.redirect('/');
              }
            }); 
        }
    })(req, res, next);
});

router.get('/auth/venmo/callback', function(req, res, next) {
	console.log(req);
});

// router.get('/auth/facebook', passport.authenticate('facebook', { scope : 'email' }));

// router.get('/auth/facebook/callback',
//         passport.authenticate('facebook', {
//             successRedirect : '/profile',
//             failureRedirect : '/'
//         }));

module.exports = router;
