
// Variables d'initalisation de Node
var express = require('express');
var session = require('cookie-session');
var bodyParser = require("body-parser");
var app = express();

var urlencodedParser = bodyParser.urlencoded({ extended: false });
app.use(express.static(__dirname + '/public'));
app.use(session({secret: 'todotopsecret'}))

// ======================================== FONCTIONS SIMPLES ============================================

function logIn(req, username, pasword) {
	req.session.username = username;
	req.session.logged = true;
}

function logOut(req, username) {
	req.session.username = '';
	req.session.logged = false;
}

// ================================================ ROUTES ===============================================

app.get('/', function(req, res) {
    res.redirect('/mainpage');
})

.get('/log', function(req, res) {
    res.render('log.ejs');
})

.get('/subscribe', function(req, res) {
	res.render('subscribe.ejs');
})

.get('/:username/info', function(req, res) {
    res.render('account_info.ejs', {username: req.params.username});
})

.get('/product/:id', function(req, res) {
    res.render('product.ejs', {id: req.params.id});
})

.get('/mainpage', function(req, res) {
	res.render('mainpage.ejs');
})

// ============================================= POST ===================================================

.post('/login', urlencodedParser, function(req, res) {
    logIn(req, req.body.username, req.body.password);
    res.redirect('/hub');
})

.post('/sign-up', urlencodedParser, function(req, res) {
	logIn(req, req.body.username, req.body.password);
    res.redirect('/hub'); 
})

.post('/logout', urlencodedParser, function(req, res) {
    logOut(req, req.body.username);
    res.redirect('/log');
});

// ========================================================================================================

app.use(function(req, res, next){
    res.setHeader('Content-Type', 'text/plain');
    res.status(404).send('Page introuvable !');
});

// On ouvre le serveur sur le port 8080 (80 pour les vrais serv)
app.listen(8080);