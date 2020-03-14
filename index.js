
// Variables d'initalisation de Node
var express = require('express');
var session = require('express-session');
var bodyParser = require("body-parser");
//var redis = require("redis");
//var redisStore = require("connect-redis")(session);
var bcrypt = require('bcryptjs');

//var client = redis.createClient();
var app = express();

var urlencodedParser = bodyParser.urlencoded({ extended: false });
app.use(session({ 
        name: "ydogbe",
        secret: 'keyboard cat', 
        /*store: new redisStore({
            host: 'localhost',
            port: 6379,
            client: client,
            ttl: 260
        }),*/
        cookie: { maxAge: 5*60*1000 }, // in millisecond
        resave: false,
        saveUninitialized: false
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

.get('/account', function(req, res) {
    res.redirect('/account/overview');
})

.get('/account/:link', function(req, res) {
    // on vérifie que l'utilisateur est bien connecté
    if (req.session.logged) {
        res.render('account.ejs', {session: req.session, link: req.params.link});
    }
    else {
        // sinon on redirige vers l'écran de connexion
        res.redirect('/login');
    }
})

// ============================================= POST ===================================================

// ----------------------- PAYOUT OPTION  ---------------------------

.post('/add-cart', urlencodedParser, function(req, res) {
    console.log("creating cookies");

    // si il n'y a pas encore cookies de panier, on en créer un
    if (!req.session.cart) {
        req.session.cart = [];
    }

    var product_id = req.body.id;
    var match = false;
    // Si le produit est déjà dans le panier, on l'incremente
    for (var i=0; i<req.session.cart.length; i++) {
        if (req.session.cart[i].id == product_id) {
            req.session.cart[i].cart_qty++;
            match = true;
        }
    }
    // Si le produit n'est pas déjà dans le panier, on l'ajoute
    if (!match) req.session.cart.push(req.body); 
    res.send('back');
})

.post('/remove-cart', urlencodedParser, function(req, res) {
    // si il n'y a pas de cookies, on ne fait rien
    if (!req.session.cart) {
        res.redirect('back');
    }
    if (req.session.id) {
        for (var i=0; i<req.session.cart.length; i++) {
            if (req.session.cart[i].id == req.body.id) req.session.cart.splice(i, 1);
        }
    }
    if (!req.session.cart.length) {
        req.session.cart = 0;
    }
    console.log(req.session.cart);
    res.redirect('back');
})

.post('/add-order', urlencodedParser, function(req, res) {
    // on refait une liste des produits simplifiée
    var products_obj = [];
    for (var i=0; i<req.session.cart.length; i++) {
        products_obj.push({
            id: parseInt(req.session.cart[i].id),
            nb: parseInt(req.session.cart[i].cart_qty),
        })
    }
    var user_id = req.session.account.id;
    var str_products = JSON.stringify(products_obj);

    // on calcule le prix totale depuis la DB (pour plus de securité)
    var total_cost = 0;
    connection.query('SELECT * FROM products', function(err, rows, fields) {
        if (err) throw err;
        for (var i=0; i<rows.length; i++) {
            for (var j=0; j<products_obj.length; j++) {
                if (products_obj[j].id == rows[i].id) {
                    total_cost += products_obj[j].nb * rows[i].price;
                    console.log(total_cost);
                }
            }
        }

        // requête MySQL
        var addOrder = `INSERT INTO orders (id, date, cost, state, user_id, products) 
                   VALUES (NULL, NOW(), ${total_cost}, 'En attente', ${user_id}, '${str_products}')`;

        connection.query(addOrder, function(err, rows, fields) {
            if (err) throw err;

            // Si l'adresse email n'est pas encore utilisé ...
            if (!rows.length) {
                req.session.alert = "add order";
                console.log("order validated!");
                res.send('ok'); // on recharge la page
            }
            else {
                res.send('badOrder');
            }
        });
    });
})

// ------------------------ ACCOUNT EDIT ---------------------------

.post('/edit-password', urlencodedParser, function(req, res) {
    console.log("change password");

    var id = req.session.account.id;
    var oldPassword = req.body.oldPassword;
    var newPassword = req.body.newPassword;

    // On construit la requête et on l'envoit (avec check d'erreur)
    var getUser = `SELECT * FROM users WHERE id='${id}'`; 

    // on vérifie d'abord que l'ancien mdp est valide ...
    connection.query(getUser, function(err, rows, fields) {
        if (err) throw err;
        var user = rows[0]; // on prend seulement 1 utilisateur (le seul en théorie)

        // Si l'id donné est bien enregistré ...
        if (user) {
            // on compare les mdp ...
            bcrypt.compare(oldPassword, user.password, function(err, response) {
                if (response) {
                    // On hash le nouveau mot de passe à enregistrer dans la DB
                    bcrypt.hash(newPassword, 10, function(err, hashedPassword) {
                        var editUser = `UPDATE users SET password = '${hashedPassword}' WHERE users.id = '${id}';`
                        
                        // on modifie le nouveau mot de passe
                        connection.query(editUser, function(err, rows, fields) {
                            if (err) throw err;

                            // Si l'utilisateur a été trouvé
                            if (!rows.length) {
                                // on met à jour les cookies
                                req.session.alert = "edit account";
                                req.session.account.password = hashedPassword;

                                console.log("password changed !");
                                res.send('ok'); // on recharge la page
                            }
                            else {
                                console.log("La modification a échoué");
                                //req.session.alert = "email already used"; // on stock l'erreur dans la seesion
                                res.send('badEdit');
                            }
                        });
                    });
                } 
                else {
                    req.session.error = "Bad password";
                    console.log("faux mot de passe"); // Les id ne correspondent pas
                    res.send('badPassword');
                }
            });
        }
        else {
            req.session.error = "Unknown user";
            console.log("aucun utilisateur"); // Les id ne correspondent pas
            res.send('badUser');
        }
    });
})

.post('/edit-adress', urlencodedParser, function(req, res) {
    console.log("change adress");

    var id = req.session.account.id;
    var adress = req.body.adress;
    var city = req.body.city;
    var country = req.body.country;

    // On construit la requête et on l'envoit (avec check d'erreur)
    var editUser = `UPDATE users SET adress = '${adress}', city = '${city}', country = '${country}' WHERE users.id = '${id}';`

    connection.query(editUser, function(err, rows, fields) {
        if (err) throw err;

        // Si l'utilisateur a été trouvé
        if (!rows.length) {
            // onmet à jour les cookies
            req.session.alert = "edit account";
            req.session.account.adress = adress;
            req.session.account.city = city;
            req.session.account.country = country;

            console.log("adress changed !");
            res.send('ok'); // on recharge la page
        }
        else {
            console.log("La modification a échoué");
            //req.session.alert = "email already used"; // on stock l'erreur dans la seesion
            res.send('badAdress');
        }
    });
})

.post('/edit-infos', urlencodedParser, function(req, res) {
    console.log("change infos");

    var name = req.body.name;
    var email = req.body.email;
    var tel = req.body.tel;

    // On construit la requête et on l'envoit (avec check d'erreur)
    var getUser = `SELECT * FROM users WHERE email='${email}'`; 
    var editUser = `UPDATE users SET name = '${name}', email = '${email}', tel = '${tel}' WHERE users.email = '${email}';`

    connection.query(editUser, function(err, rows, fields) {
        if (err) throw err;

        // Si l'utilisateur a été trouvé
        if (!rows.length) {
            // onmet à jour les cookies
            req.session.alert = "edit account";
            req.session.account.name = name;
            req.session.account.email = email;
            req.session.account.tel = tel;

            console.log("infos changed !");
            res.send('ok'); // on recharge la page
        }
        else {
            console.log("La modification a échoué");
            //req.session.alert = "email already used"; // on stock l'erreur dans la seesion
            res.send('badInfos');
        }
    });
})

.post('/edit-newsletter', urlencodedParser, function(req, res) {
    console.log("change newsletter");

    var id = req.session.account.id;
    var newsletter = req.body.newsletter;

    // On construit la requête et on l'envoit (avec check d'erreur)
    var editUser = `UPDATE users SET newsletter = ${newsletter} WHERE users.id = '${id}';`

    connection.query(editUser, function(err, rows, fields) {
        if (err) throw err;

        // Si l'utilisateur a été trouvé
        if (!rows.length) {
            // on met à jour les cookies
            req.session.alert = "edit account";
            req.session.account.newsletter = newsletter;

            console.log("newsletter changed !");
            res.send('ok'); // on recharge la page
        }
        else {
            console.log("La modification a échoué");
            //req.session.alert = "email already used"; // on stock l'erreur dans la seesion
            res.send('badNewsletter');
        }
    });
})

// ---------------------------- LOGIN/OUT ---------------------------

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
                    req.session.account = user;
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
    var adress = req.body.adress;
    var city = req.body.city;
    var country = req.body.country;
	var username = req.body.name;
    var password = req.body.password;
    var newsletter = req.body.newsletter;
    var email = req.body.email;
    var tel = req.body.tel;
    
    // Si la case n'est pas coché -> no
    if (!newsletter) {
        newsletter = "no";
    }

    // On hash le mot de passe à enregistrer dansla DB
    bcrypt.hash(password, 10, function(err, hashedPassword) {
        // On construit la requête et on l'envoit (avec check d'erreur)
        var getUser = `SELECT * FROM users WHERE email='${email}'`; 
        var addUser = `INSERT INTO users (id, name, password, subscribe_date, adress, city, country, newsletter, email, tel) 
                   VALUES (NULL, "${username}", "${hashedPassword}", NOW(), "${adress}", "${city}", "${country}", "${newsletter}", "${email}", "${tel}")`;  

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
    res.redirect('/');
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