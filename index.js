
// Variables d'initalisation de Node
var express = require('express');
var session = require('express-session');
var bodyParser = require("body-parser");
var bcrypt = require('bcrypt');
var app = express();

var urlencodedParser = bodyParser.urlencoded({ extended: false });
app.use(session({ 
        secret: 'keyboard cat', 
        cookie: { maxAge: 60000 },
        resave: false,
        saveUninitialized: true
    })
);
app.use(express.static(__dirname + '/public'));

var mysql      = require('mysql');
var connection = mysql.createConnection({
    host     : 'localhost',
    user     : 'root',
    password : '',
    database : 'ydogbe'
});

// ======================================== FONCTIONS SIMPLES ============================================

function subscribe(req, res, username, password, adresse, newsletter, email) {
    // On hash le mot de passe à enregistrer dansla DB
    bcrypt.hash(password, 10, function(err, hashedPassword) {
        // On construit la requête et on l'envoit (avec check d'erreur)
        var getUser = `SELECT * FROM users WHERE email='${email}'`; 
        var addUser = `INSERT INTO users (id, name, password, subscribe_date, adresse, newsletter, email) 
                   VALUES (NULL, "${username}", "${hashedPassword}", NOW(), "${adresse}", "${newsletter}", "${email}")`;  

        connection.query(getUser, function(err, rows, fields) {
            if (err) throw err;

            // Si l'adresse email n'est pas encore utilisé ...
            if (!rows.length) {
                connection.query(addUser, function(err, rows, fields) {
                    if (err) throw err;
                    console.log("Utilisateur ajouté");
                    logIn(req, email, password)  // On log l'utilisateur ensuite
                    res.redirect('/');  // on redirige vers le menu
                });
            }
            else {
                console.log("L'adresse mail est déjà utilisé");
                res.redirect('back');  // on reload la page
                req.session.error = "L'adresse mail est déjà utilisé"; // on stock l'erreur dans la seesion (pour créer une notif)
            }
        });
    });
}

function logIn(req, email, password) {
    // On construit la requête et on l'envoit
    var requestMysql = `SELECT * FROM users WHERE email='${email}'`;
    connection.query(requestMysql, function(err, rows, fields) {
        if (err) throw err;
        var user = rows[0]; // on prend seulement 1 utilisateur (le seul en théorie)

        // Si l'email donné est bien enregistré ...
        if (user) {
            bcrypt.compare(password, user.password, function(err, res) {
                // Si les mots de passe correspondent ...
                if (res) {
                    req.session.username = user.username;
                    req.session.logged = true; 
                    console.log("logged !");
                }  
            });
        }
        else {
            console.log("aucun utilisateur");
            // Les id ne correspondent pas
        }
    });    
}

function logOut(req, email) {
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
    logIn(req, req.body.email, req.body.password);
    res.redirect('back');
})

.post('/sign-up', urlencodedParser, function(req, res) {
    var adresse = `${req.body.adresse} ${req.body.city} ${req.body.country}`; // L'adresse est l'assemblage de la ville, pays et rue.
	
    // Si la case n'est pas coché -> no
    if (!req.body.newsletter) {
        req.body.newsletter = "no";
    }
    console.log(req.body.newsletter);
    subscribe(req, res, req.body.name, req.body.password, adresse, req.body.newsletter, req.body.email);
})

.post('/logout', urlencodedParser, function(req, res) {
    logOut(req, req.body.username);
    res.redirect('back');
});

// ========================================================================================================

app.use(function(req, res, next){
    res.setHeader('Content-Type', 'text/plain');
    res.status(404).send('Page introuvable !');
});

// On ouvre le serveur sur le port 8080 (80 pour les vrais serv)
app.listen(8080);