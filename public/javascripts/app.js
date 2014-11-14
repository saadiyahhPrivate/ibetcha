'use strict';

/* App Module */
var ibetcha = angular.module('ibetcha', [
  'ngRoute',
  'ngResource',
  'ngAnimate',
  'ngCookies',
]);

// Configures routes with templates and controllers
// CLIENT-SIDE ROUTES:
// #/ - login page
// #/home - home page (differs for logged in users and not logged in users)
// #/roadmaps/:id - view for a single roadmap with specified id
// #/edit - edit roadmap view for Alums only 
ibetcha.config(['$routeProvider', '$locationProvider',
  function($routeProvider, $locationProvider) {
    $routeProvider.
      when('/', {
        templateUrl: 'partials/loginPage.html',
        controller: 'LoginPageController'
      }).
      when('/home', {
        templateUrl: 'partials/home.html',
        controller: 'HomePageController'
      }).
      otherwise({
        templateUrl: 'partials/loginPage.html',
        controller: 'LoginPageController'
      });
  }]);