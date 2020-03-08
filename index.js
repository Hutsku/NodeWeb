
// Variables d'initalisation de Node
var express = require('express');
var session = require('express-session');
var bodyParser = require("body-parser");
var bcrypt = require('bcryptjs');
var app = express();

var urlencodedParser = bodyParser.urlencoded({ extended: false });
app.use(session({ 
        name: "ydogbe",
        secret: 'keyboard cat', 
        cookie: { maxAge: 60000 },
        resave: false,
        saveUninitialized: true
    })
);
app.use(express.static(__dirname + '/public'));
app.use('/scripts', express.static(__dirname + '/node_modules/'));
app.set('view engine', 'ejs');

var mysql      = require('mysql');
var connection = mysql.createConnection({
    host     : 'localhost',
    user     : 'root',
    password : '',
    database : 'ydogbe'
});

// ================================================ ROUTES ===============================================

app.get('/', function(req, res) {
    res.redirect('/mainpage');
})

.get('/login', function(req, res) {
    res.render('login.ejs', {session: req.session});
})

.get('/quit', function(req, res) {
    req.session.username = "";
    req.session.logged = false;
    req.session.alert = "logout";
    res.redirect('back');
})

.get('/subscribe', function(req, res) {
	res.render('subscribe.ejs', {session: req.session});
})

.get('/:username/info', function(req, res) {
    res.render('account_info.ejs', {username: req.params.username, session: req.session});
})

.get('/product/:id', function(req, res) {
    // on construit la requete mysql
    var requestMysql = `SELECT * FROM products WHERE id='${req.params.id}'`;
    connection.query(requestMysql, function(err, rows, fields) {
        if (err) throw err;
        var product = rows[0]; // on prend seulement 1 produit (le seul en théorie)

        // On envoit les données du produit à la page
        res.render('product.ejs', {
            id: product.id, 
            reference: product.reference,
            name: product.name,
            stocks: product.stocks,
            price: product.price,
            description: product.description,
            size: product.size,
            printing: product.printing,
            category: product.category,
            session: req.session
        });
    }); 

    
})

.get('/cart', function(req, res) {
    res.render('cart.ejs', {session: req.session});
})

.get('/mainpage', function(req, res) {
    // on construit la requete mysql:on selectionne tout les produits disponibles
    var requestMysql = `SELECT * FROM products`;
    connection.query(requestMysql, function(err, rows, fields) {
        if (err) throw err;

        var products = []; // on initialise la liste des produit
        for (var i=0; i< rows.length; i++) {
            products.push({
                id: rows[i].id, 
                reference: rows[i].reference,
                name: rows[i].name,
                price: rows[i].price,
            })
        }

        // On envoit les données du produit à la page
        res.render('mainpage.ejs', {
            products: products, 
            session: req.session
        });
    }); 
})

// ============================================= POST ===================================================

.post('/add-cart', urlencodedParser, function(req, res) {
    console.log("creating cookies");

    // si il n'y a pas encore cookies de panier, on en créer un
    if (!req.session.cart) {
        req.session.cart = [];
    }
    console.log(req.body);
    req.session.cart.push(req.body);
    req.session.alert = "cart";
    res.redirect('back');
})

.post('/login', urlencodedParser, function(req, res) {
    var password = req.body.password;
    var email = req.body.email;

    // On construit la requête et on l'envoit
    //var requestMysql = `SELECT * FROM users WHERE email='${email}'`;
    console.log(email);
    var requestMysql = `SELECT * FROM users WHERE email='${email}'`;
    connection.query(requestMysql, function(err, rows, fields) {
        if (err) throw err;
        var user = rows[0]; // on prend seulement 1 utilisateur (le seul en théorie)

        // Si l'email donné est bien enregistré ...
        if (user) {
            bcrypt.compare(password, user.password, function(err, response) {
                // Si les mots de passe correspondent ...
                if (response) {
                    req.session.username = user.name;
                    req.session.logged = true;
                    req.session.alert = "login";
                    console.log("logged !");
                    res.redirect('back');
                } 
                else {
                    req.session.error = "Bad password";
                    console.log("faux mot de passe"); // Les id ne correspondent pas
                    res.send('badPassword');
                }
            });
        }
        else {
            req.session.error = "Unknown email";
            console.log("aucun utilisateur"); // Les id ne correspondent pas
            res.send('badEmail');
        }
    }); 
})

.post('/sign-up', urlencodedParser, function(req, res) {
    var adresse = req.body.adresse; // L'adresse est l'assemblage de la ville, pays et rue.
	var username = req.body.name;
    var password = req.body.password;
    var newsletter = req.body.newsletter;
    var email = req.body.email;
    
    // Si la case n'est pas coché -> no
    if (!newsletter) {
        newsletter = "no";
    }

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
                    req.session.alert = "signup";
                    console.log("sign up !");
                    res.redirect('back'); // on recharge la page
                });
            }
            else {
                console.log("L'adresse mail est déjà utilisé");
                //req.session.alert = "email already used"; // on stock l'erreur dans la seesion
                res.send('badEmail');
            }
        });
    });
})

.post('/logout', urlencodedParser, function(req, res) {
    req.session.username = '';
    req.session.logged = false;
    res.redirect('back');
})

.post('/resetNotif', urlencodedParser, function(req, res) {
    req.session.alert = false;
    res.end();
});

// ========================================================================================================

app.use(function(req, res, next){
    res.setHeader('Content-Type', 'text/plain');
    res.status(404).send('Page introuvable !');
});

// On ouvre le serveur sur le port 8080 (80 pour les vrais serv)
app.listen(8080, '192.168.1.18');