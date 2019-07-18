
// Variables d'initalisation de Node
var express = require('express');
var session = require('cookie-session');
var bodyParser = require("body-parser");
var app = express();

var urlencodedParser = bodyParser.urlencoded({ extended: false });
app.use(express.static(__dirname + '/public'));
app.use(session({secret: 'todotopsecret'}))

var mysql      = require('mysql');
var connection = mysql.createConnection({
    host     : 'localhost',
    user     : 'root',
    password : '',
    database : 'ydogbe'
});

// ========================================== FONCTION MYSQL =============================================

function addUser (username, password, adresse, newsletter, email) {
    var req = `INSERT INTO users (id, name, password, subscribe_date, adresse, newsletter, email) 
               VALUES (NULL, "${username}", "${password}", NOW(), "${adresse}", "${newsletter}", "${email}")`;
    connection.query(req, function(err, rows, fields) {
        if (err) throw err;
        console.log(rows);
    });
}

// ======================================== FONCTIONS SIMPLES ============================================

function subscribe(req, username, password, adresse, newsletter, email) {
    addUser(username, password, adresse, newsletter,email);
    logIn(req, username, password)
}

function logIn(req, username, password) {
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
    res.redirect('/mainpage');
})

.post('/sign-up', urlencodedParser, function(req, res) {
    var adresse = `${req.body.adresse} ${req.body.city} ${req.body.country}`; // L'adresse est l'assemblage de la ville, pays et rue.
	
    // Si la case n'est pas coché -> no
    if (!req.body.newsletter) {
        req.body.newsletter = "no";
    }
    console.log(req.body.newsletter);
    subscribe(req, req.body.name, req.body.password, adresse, req.body.newsletter, req.body['e-mail']);
    res.redirect('/'); 
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