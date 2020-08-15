
// ============================================= INITALIZATION ============================================

console.log('Initalisation du site web ...')
var config = require('./config.js');

// Si le serveur tourne en local, récupère les cred d'un fichier local. (pas de requête vault)
if (config.local_test) {
    console.log('/!\\ LE SITE EST EN VERSION TEST LOCAL /!\\');
    var cred = require('./local_credentials.js');
}

// get new instance of the client
console.log('Configuration de vault')
var vault      = require("node-vault")(config.vault);

// On importe tout les modules necessaires
console.log('Importation des modules ...')
const path     = require('path');
var express    = require('express');
var session    = require('express-session');
var bodyParser = require("body-parser");
var bcrypt     = require('bcryptjs');
var multer     = require('multer')
const Stripe   = require('stripe')
const Email    = require('email-templates'); // include nodemailer
var mysql      = require('mysql');

var upload;
function multer_init() {
    var storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, path.resolve(__dirname, './public/img/'))
      },
      filename: function (req, file, cb) {
        cb(null, file.originalname)
      }
    })
    upload = multer({
        storage: storage,
        onError : function(err, next) {
            console.log('error', err);
            next(err);
        }
    }).any();
    console.log("> Multer configuré.");
};

var email;
function email_init (cred) {
    // setup transporter (mailtrap for test, outlook for production)
    var transport_mailtrap = config.email.mailtrap;
    var transport_gmail    = config.email.gmail;

    // edit the transporter with real credentials
    transport_gmail.auth = {
        user: cred.user, 
        pass: cred.password  
    }

    // Build-up the email object
    email = new Email({
        views: config.email.views,
        message: {
            from: config.email.from
        },
        // uncomment below to send emails in development/test env:
        send: config.email.send,
        preview: config.email.send.preview,
        transport: transport_gmail,
    });
    console.log("> Connection SMTP configuré.");
};

var connection;
function mysql_init (cred) {
    // Créer la connection avec la BDD mysql.
    connection = mysql.createConnection({
        host     : 'localhost',
        user     : cred.user,
        password : cred.password,
        database : 'ydogbe'
    });
    console.log("> BDD MySQL connecté.");
};

var stripe;
function stripe_init (cred) {
    stripe = Stripe(cred.secret); // test key
    console.log("> Stripe configuré (secret key).");
};

var admin_user;
function adminUser_init (cred) {
    // Liste des email (utilisateur) ayant accès au droit admin (gestion des articles et commandes)
    admin_user = cred;
    console.log('> Comptes admin reconnus.');
};

var app;
var urlencodedParser;
function app_init () {
    // init app et configure les cookies de session
    app = express();
    urlencodedParser = bodyParser.urlencoded({ extended: false });

    app.use(session(config.cookies));
    app.use(express.static(__dirname + '/public'));
    app.use('/scripts', express.static(__dirname + '/node_modules/'));
    app.set('view engine', 'ejs');  

    app.use(function(req, res, next){
        // On met en place les variable de dev pour le frontend
        req.session.debug      = config.debug;
        req.session.production = config.production;
        next();
    });
    console.log("> Création de l'app et cookies de session configurés.");
};

// ---------------------- LAUNCH INIT -------------------

// Si on est en test local, on prend les id sur le fichier. Sinon, on utilsie vault
if (config.local_test) {
    email_init(cred.email);
    mysql_init(cred.mysql);
    stripe_init(cred.stripe);
    adminUser_init(cred.admin);
} 
else {
    vault.read('ydogbe/email')
    .then(function(res) {
        email_init(res.data);
    }).catch(console.error);

    vault.read('ydogbe/mysql')
    .then(function(res) {
        mysql_init(res.data);
    }).catch(console.error);

    vault.read('ydogbe/stripe')
    .then(function(res) {
        stripe_init(res.data);
    }).catch(console.error);

    vault.read('ydogbe/admin')
    .then(function(res) {
        adminUser_init(Object.values(res.data));
    }).catch(console.error);
}

// init the other functionnality (without vault)
multer_init();
app_init();

// ============================================= GLOBAL FUNCTIONS ========================================

// Renvoit une liste de tout les utilisateur (avec leur informations)
function getAllUser(callback) {
    var requestMysql = `SELECT * FROM users`;
    connection.query(requestMysql, function(err, rows, fields) {
        if (err) throw err;
        callback(rows);
    });
}

// Renvoit une liste de tout les produits (avec leur informations)
function getAllProduct(callback) {
    var requestMysql = `SELECT * FROM products`;
    connection.query(requestMysql, function(err, rows, fields) {
        if (err) throw err;
        callback(rows);
    });
}

function escapeQuote(string) {
    string = string.replace(/'/g, `\'`); // on escape toutes les occurences de '
    string = string.replace(/"/g, `\\"`); // on escape toutes les occurences de ""
    return string;
}

function safeQuote(string) {
    string = string.replace(/'/g, `''`); // on double toutes les occurences de '
    return string;
}

// Renvoit le frais de port selon le pays et code postal (Colissimo)
function getShippingCost(country, postal_code) {
    // On définie à l'avance les prix (250mg)
    var metroCost = 4.95;
    var domtomCost = 9.60;
    var euroCost = 12.55;
    var inter1Cost = 17.00;
    var inter2Cost = 24.85;

    // On définit les differentes zones
    var euro = ['DE', 'AT', 'BE', 'BG', 'CY', 'HR', 'DK', 'ES', 'EE', 'FI', 'FR', 'GR', 'HU', 'IE', 'IT', 'LT', 
    'LV', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'SE', 'CZ', 'CH', 'SM', 'LI']; // UE + suisse etc
    var inter1 = ['NO', 'BA', 'HR', 'MK', 'ME', 'RS', 'AL', 'DZ', 'MA', 'TN', 'LY', 'MR'] // Europe Est + Norvège + Maghreb

    console.log(country)

    // Si le client est en france ...
    if (country == 'FR') {
        if (['97', '98'].indexOf(postal_code.slice(0, 2)) >= 0) return domtomCost;
        else return metroCost;
        
    }
    else if (['MC', 'AD'].indexOf(country) >= 0) return metroCost; // Si Andorre ou Monaco
    else if (euro.indexOf(country) >= 0) return euroCost; // Si UE + Suisse et autres
    else if (inter1.indexOf(country) >= 0) return inter1Cost; // Si EU Est + Maghreb + Norvège
    else return inter2Cost; // Sinon -> international
}

// Met à jour le panier selon le statut de l'utilisateur
function refreshCart(session) {
    console.log(session.logged)
    if (session.cart) {
        if (session.logged) {
            session.cart.shipping_cost = getShippingCost(session.account.country, session.account.postal_code); // On récupère les frais de port estimés
        } else {
            session.cart.shipping_cost = 4.95;
        }
        session.cart.total_cost = parseFloat(session.cart.shipping_cost) + parseFloat(session.cart.subtotal_cost);
        return session.cart;
    } else {
        return 0;
    }
}

// ---------------------------- EMAIL ----------------------- 

function checkAdmin(email) {
    return admin_user.includes(email)
}

// Envoit un email avec le template et les paramètres specifiés
function sendEmail(template, emailTo, parameter) {
    email.send({
        template: template,
        message: {
            to: emailTo
        },
        locals: parameter,
    })
    .then(console.log)
    .catch(console.error);
}

// ================================================ ROUTES ===============================================

console.log('Création des routes POST et GET')
app.get('/', function(req, res) {
    res.redirect('/mainpage');
})

.get('/login', function(req, res) {
    res.render('login.ejs', {session: req.session});
})

.get('/quit', function(req, res) {
    req.session.username = '';
    req.session.logged = false;
    req.session.admin = false;
    req.session.account = false;

    // On met à jour le panier si jamais
    req.session.cart = refreshCart(req.session);

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
            reference: product.id,
            name: product.name,
            available: product.available,
            composition: product.composition,
            price: product.price,
            description: product.description,
            size: product.size,
            printing: product.printing,
            category: product.category,
            type: product.type,
            img: JSON.parse(product.images),
            session: req.session
        });
    }); 
})

.get('/order-detail/:id', function(req, res) {
    var getOrder = `SELECT * FROM orders WHERE id=${req.params.id}`;
    connection.query(getOrder, function(err, rows, fields) {
        if (err) throw err;
        order = rows[0];

        // On verifie que l'utilisateur est connecté et que la commande existe
        if (order && req.session.logged) {
            // on vérifie que l'utilisateur est bien admin ou que la commande appartient bien au client
            if ((req.session.admin && checkAdmin(req.session.account.email)) || req.session.account.id == order.user_id) {
                console.log(order.products)
                res.render('order-detail.ejs', {
                    order: order,
                    session: req.session
                });
            }
            else {
                // sinon on recharge la page
                res.redirect('back');
            }
        }
        else {
            // sinon on recharge la page
            res.redirect('back');
        }
    });
})

.get('/cart', function(req, res) {
    console.log(req.session.cart);
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
                name: rows[i].name,
                price: rows[i].price,
                img: JSON.parse(rows[i].images)
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
        if (req.params.link == "order") {
            var user_id = req.session.account.id;
            var getOrder = `SELECT * FROM orders WHERE user_id='${user_id}'`;

            connection.query(getOrder, function(err, rows, fields) {
                if (err) throw err;

                res.render('account.ejs', {session: req.session, link: req.params.link, orders: rows});
            });
        }
        else res.render('account.ejs', {session: req.session, link: req.params.link});
    }
    else {
        // sinon on redirige vers l'écran de connexion
        res.redirect('/login');
    }
})

.get('/contact', function(req, res) {
    res.render('contact.ejs', {session: req.session});
})

.get('/test-dev', function (req, res) {
    sendEmail('test', 'arouxel.trash@outlook.fr')
    res.redirect('back');
})

.get('/gilbert', function (req, res) {
    res.render('gilbert.ejs', {session: req.session});
})

// ----------------------- ADMIN PAGE ------------------------

.get('/admin-products-list', function(req, res) {
    // on vérifie que l'utilisateur est bien admin (double verification si jamais)
    if (req.session.admin && checkAdmin(req.session.account.email)) {
        var getProducts = `SELECT * FROM products`;

        connection.query(getProducts, function(err, rows, fields) {
            if (err) throw err;

            res.render('admin-products-list.ejs', {session: req.session, products: rows});
        });
    }
    else {
        // sinon on redirige vers l'écran de connexion
        res.redirect('/mainpage');
    } 
})

.get('/admin-edit-product/:id', function(req, res) {
    // on vérifie que l'utilisateur est bien admin (double verification si jamais)
    if (req.session.admin && checkAdmin(req.session.account.email)) {
        var getProduct = `SELECT * FROM products WHERE id=${req.params.id}`;

        connection.query(getProduct, function(err, rows, fields) {
            if (err) throw err;
            product = rows[0];
            res.render('admin-edit-product.ejs', {
                id: product.id, 
                reference: product.id,
                name: product.name,
                stocks: product.stocks,
                price: product.price,
                description: product.description,
                size: product.size,
                printing: product.printing,
                category: product.category,
                available: product.available,
                type: product.type,
                composition: product.composition,
                img: JSON.parse(product.images),
                session: req.session
            });
        });
    }
    else {
        // sinon on redirige vers l'écran de connexion
        res.redirect('/admin-products-list');
    } 
})

.get('/admin-add-product', function(req, res) {
    // on vérifie que l'utilisateur est bien admin (double verification si jamais)
    if (req.session.admin && checkAdmin(req.session.account.email)) {
        res.render('admin-add-product.ejs', {session: req.session});
    }
    else {
        // sinon on redirige vers l'écran de connexion
        res.redirect('/admin-products-list');
    } 
})

.get('/admin-orders-list', function(req, res) {
    // on vérifie que l'utilisateur est bien admin (double verification si jamais)
    if (req.session.admin && checkAdmin(req.session.account.email)) {
        var getOrders = `SELECT * FROM orders`;

        connection.query(getOrders, function(err, rows, fields) {
            if (err) throw err;

            getAllUser(function(userList) {
                var orderList = [];
                for (var i=0; i<rows.length; i++) {
                    orderList.push({
                        id: rows[i].id,
                        name: (function(){
                            // on retrouve le nom de l'utilisateur avec son id
                            for (var j=0; j<userList.length; j++) {
                                if (userList[j].id == rows[i].user_id) return userList[j].name;
                            }
                        })(),
                        price: rows[i].total_cost,
                        status: rows[i].state,
                        products: rows[i].products,
                        address: rows[i].shipping_address,
                        payment: rows[i].payment_method,
                    })
                }

                res.render('admin-orders-list.ejs', {session: req.session, orders: orderList});
            });
        });
    }
    else {
        // sinon on redirige vers l'écran de connexion
        res.redirect('/mainpage');
    } 
})

.get('/admin-update-order/:id', function(req, res) {
    // on vérifie que l'utilisateur est bien admin (double verification si jamais)
    if (req.session.admin && checkAdmin(req.session.account.email)) {
        connection.query(`SELECT * FROM orders WHERE id=${req.params.id}`, function(err, rows, fields) {
            if (err) throw err;

            // on definit le nouveau statut de la commande selon son état précédant
            switch (rows[0].state){
                case 'waiting': 
                    var status = 'confirmed';
                    break;
                case 'confirmed': 
                    var status = 'shipped';
                    break;
                default: 
                    var status = 'waiting';
            }

            // Si la commande est envoyée, on récupère l'email du client et on lui envoit un email de confirmation
            if (status == "shipped") {
                var getUserEmail = `SELECT email FROM users WHERE id = ${rows[0].user_id}`;
                connection.query(getUserEmail, function(err, resultUser, fields) {
                    if (err) throw err;
                    sendEmail('order-shipped', resultUser[0].email, {
                        order_id: req.params.id
                    })
                });
            }

            var updateOrder = `UPDATE orders SET state = '${status}' WHERE orders.id = '${req.params.id}'`;  
            connection.query(updateOrder, function(err, rows, fields) {
                if (err) throw err;

                req.session.alert = "order updated";
                res.redirect('back');
            });
        });
    }
})

.get('/admin-remove-order/:id', function(req, res) {
    // on vérifie que l'utilisateur est bien admin (double verification si jamais)
    if (req.session.admin && checkAdmin(req.session.account.email)) {

        // On récupère d'abord les informations avant de supprimer et on envois le mail
        connection.query(`SELECT * FROM orders WHERE id=${req.params.id}`, function(err, rows, fields) {
            if (err) throw err;

            // Si la commande est supprimée, on récupère l'email du client et on lui envoit un email d'explication
            connection.query(`SELECT email FROM users WHERE id = ${rows[0].user_id}`, function(err, resultUser, fields) {
                if (err) throw err;
                sendEmail('order-removed', resultUser[0].email);
            });

            // En parallèle on supprime la commande de la BDD
            connection.query(`DELETE FROM orders WHERE id = '${req.params.id}'`, function(err, rows, fields) {
                if (err) throw err;
                req.session.alert = "order removed";
                res.redirect('back');
            });
        });
    }
})

// ------------------------ PAYOUT  --------------------------

.get('/payout-infos', function(req, res) {
    // Verifie si les condition du payout sont valides (panier + log)
    if (!req.session.cart.products) {
        // Si le client n'a pas de panier, on le renvoit à cet page
        res.redirect('/cart');
        return false;
    }

    //console.log(req.session.cart.subtotal_cost)

    // Si le client est déjà log, on passe à la 2e étape
    if (req.session.logged) {
        res.redirect('/payout-shipping');
    }
    else {
        res.render('payout-infos.ejs', {
                session: req.session, 
                subtotal_cost: req.session.cart.subtotal_cost,
                shipping_cost: req.session.cart.shipping_cost,
                total_cost: req.session.cart.total_cost,
                user: req.session.account
            }
        );
    }
})

.get('/payout-shipping', function(req, res) {
    // Verifie si les condition du payout sont valides (panier + log)
    if (!req.session.cart) {
        // Si le client n'a pas de panier, on le renvoit à cet page
        res.redirect('/cart');
    }
    else if (!req.session.logged) {
        // Si le client n'est pas connecté, on lui renvois sur la section appropriée
        res.redirect('/payout-infos');
    }
    else {
        console.log(req.session.cart)
        res.render('payout-shipping.ejs', {
                session: req.session, 
                subtotal_cost: req.session.cart.subtotal_cost,
                shipping_cost: req.session.cart.shipping_cost,
                total_cost: req.session.cart.total_cost,
                user: req.session.account
            }   
        );
    }  
})

.get('/payout-final', function(req, res) {
    // Verifie si les condition du payout sont valides (panier + log)
    if (!req.session.cart) {
        // Si le client n'a pas de panier, on le renvoit à cet page
        res.redirect('/cart');
        return false;
    }
    else if (!req.session.logged) {
        // Si le client n'est pas connecté, on lui renvois sur la section appropriée
        res.redirect('/payout-infos');
        return false;
    }

    // On recalcule le prix exacte de la commande
    // on refait une liste des produits simplifiée
    var cart = req.session.cart.products;
    var products_obj = [];
    for (var i=0; i<cart.length; i++) {
        products_obj.push({
            id: parseInt(cart[i].id),
            nb: parseInt(cart[i].cart_qty),
        });
    }

    // on calcule le prix totale depuis la DB (pour plus de securité)
    var total_cost = 0;
    connection.query('SELECT * FROM products', function(err, rows, fields) {
        if (err) throw err;
        for (var i=0; i<rows.length; i++) {
            for (var j=0; j<products_obj.length; j++) {
                if (products_obj[j].id == rows[i].id) {
                    total_cost += products_obj[j].nb * rows[i].price;
                }
            }
        }

        shipping_cost = req.session.cart.shipping_cost;
        subtotal_cost = total_cost;
        total_cost = (subtotal_cost+shipping_cost).toFixed(2);

        // On met à jour le panier
        req.session.cart.shipping_cost = shipping_cost;
        req.session.cart.total_cost = total_cost;
        req.session.subtotal_cost = subtotal_cost;

        amount = Math.round(total_cost*100); // on converti en valeur prise en charge par stripe
        console.log(total_cost)

        // On prépare le payement carte via Stripe
        stripe.paymentIntents.create(
        {
            amount: amount,
            currency: 'eur',
            payment_method_types: ['card'],
        }, 
        function (err, paymentIntent) {
            res.render('payout-final.ejs', {
                session: req.session, 
                client_secret: paymentIntent.client_secret, 
                total_cost: total_cost,
                subtotal_cost: subtotal_cost,
                shipping_cost: shipping_cost,
                user: req.session.account
            });
        });
    });
})

.get('/payout', function(req, res) {
    // On renvoit vers la 1ère étape par défaut
    res.redirect('/payout-infos');
})

.get('/payment-success', function(req, res) {
    // A afficher lorsque le payement a été effectué
    res.render('payment-success.ejs', {session: req.session});
})

// ============================================= POST ===================================================

// ----------------------- ADMIN EDIT -------------------------------

.post('/admin-remove-product', urlencodedParser, function(req, res) {
    // si il n'y a pas encore cookies de panier, on en créer un
    
    // on vérifie que l'utilisateur est bien admin (double verification si jamais)
    if (req.session.admin && checkAdmin(req.session.account.email)) {
        var product_id = req.body.edit; // recupère la valeur du bouton 'edit' du formulaire
        var removeProduct = `DELETE FROM products WHERE products.id = ${product_id}`;

        connection.query(removeProduct, function(err, rows, fields) {
            if (err) throw err;

            req.session.alert = "remove product";
            res.redirect('back');
        });
    }
    else {
        // sinon on redirige vers l'écran de connexion
        res.send('no admin');
    }
})

.post('/admin-add-product', urlencodedParser, function(req, res) {
    // si il n'y a pas encore cookies de panier, on en créer un
    
    // on vérifie que l'utilisateur est bien admin (double verification si jamais)
    if (req.session.admin && checkAdmin(req.session.account.email)) {
        var name = safeQuote(req.body.name);
        var description = safeQuote(req.body.description);
        var price = req.body.price;
        var size = req.body.size;
        var printing = req.body.printing;
        var category = req.body.category;
        var available = req.body.available;
        var type = req.body.type;
        var composition = req.body.composition;
        var img_list = req.body.images;

        var addProduct = `INSERT INTO products (name, available, description, price, size, printing, category, type, composition, images) 
            VALUES ('${name}', '${available}', '${description}', '${price}', '${size}', '${printing}', '${category}', '${type}', '${composition}', '${img_list}')`;  
        connection.query(addProduct, function(err, rows, fields) {
            if (err) throw err;

            req.session.alert = "add product";
            res.redirect('back');
        });
    }
    else {
        // sinon on redirige vers l'écran de connexion
        res.send('no admin');
    }
})

.post('/admin-edit-product', urlencodedParser, function(req, res) {
    // si il n'y a pas encore cookies de panier, on en créer un
    
    // on vérifie que l'utilisateur est bien admin (double verification si jamais)
    if (req.session.admin && checkAdmin(req.session.account.email)) {


        var id = req.body.id;
        var name = safeQuote(req.body.name);
        var description = safeQuote(req.body.description);
        var price = req.body.price;
        var size = req.body.size;
        var printing = req.body.printing;
        var category = req.body.category;
        var available = req.body.available;
        var type = req.body.type;
        var composition = req.body.composition;
        var img_list = req.body.images;

        var editProduct = `UPDATE products SET name = '${name}', description = '${description}', price = '${price}', 
            size = '${size}', printing = '${printing}', category = '${category}', available = '${available}', 
            images = '${img_list}', type = '${type}', composition = '${composition}' WHERE products.id = '${id}'`;  
        connection.query(editProduct, function(err, rows, fields) {
            if (err) throw err;

            req.session.alert = "edit product";
            res.redirect('back');
        });
    }
    else {
        // sinon on redirige vers l'écran de connexion
        res.send('no admin');
    }
})

.post('/upload-img', urlencodedParser, function(req, res) {
    console.log("uploading file")
    upload(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            console.log(err)
        } else if (err) {
            console.log(err)
        }

        console.log('uploaded')
    });
})

// ----------------------- PAYOUT OPTION  ---------------------------

.post('/add-cart', urlencodedParser, function(req, res) {
    // si il n'y a pas encore cookies de panier, on en créer un
    if (!req.session.cart) {
        req.session.cart = {
            products: [],
            subtotal_cost: 0,
            shipping_cost: 4.95, // valeur par défaut si non connecté
            total_cost: 0,
        }
    }
    // On paramètre les frais de port si connecté
    if (req.session.logged) {
        req.session.cart.shipping_cost = getShippingCost(req.session.account.country, req.session.account.postal_code); // On récupère les frais de port estimés
    }

    var product_id = req.body.id;
    var product_option = req.body.option;
    var match = false;
    // Si le produit est déjà dans le panier, on l'incremente
    for (var i=0; i<req.session.cart.products.length; i++) {
        if (req.session.cart.products[i].id == product_id && req.session.cart.products[i].option == product_option) {
            req.session.cart.products[i].cart_qty++;
            match = true;
        }
    }
    // Si le produit n'est pas déjà dans le panier, on l'ajoute
    if (!match) req.session.cart.products.push(req.body); 
    res.send('back');
})

.post('/remove-cart', urlencodedParser, function(req, res) {
    // si il n'y a pas de cookies, on ne fait rien
    if (!req.session.cart) {
        res.redirect('back');
    }

    var product_id = req.body.id;
    var product_option = req.body.option;
    console.log(product_id)
    if (req.session.id) {
        for (var i=0; i<req.session.cart.products.length; i++) {
            if (req.session.cart.products[i].id == product_id && req.session.cart.products[i].option == product_option) {
                req.session.cart.products.splice(i, 1);
            }
        }
    }
    if (!req.session.cart.products.length) {
        req.session.cart = 0;
    }
    res.redirect('back');
})

.post('/valid-cart', urlencodedParser, function(req, res) {
    // on remplace le panier par celui envoyé (en le convertissant)
    console.log(req.body['cart'])
    req.session.cart.products = JSON.parse(req.body['cart']);
    req.session.cart.subtotal_cost = req.body.subtotal_cost;
    req.session.cart.shipping_cost = req.body.shipping_cost;
    req.session.cart.total_cost = req.body.total_cost;

    res.send('ok')
    //res.render('cart.ejs', {session: req.session});
})

.post('/valid-shipping', urlencodedParser, function(req, res) {
    // valide et enregistre les paramètre de livraison
    req.session.cart.shipping_method = req.body.shippingMethod;
    var shippingAddressValue = req.body.shippingAddress;

    // si on a choisi une autre adresse de livraison
    if (shippingAddressValue) {
        req.session.cart.shipping_address = {
            address1: req.body.address1,
            address2: req.body.address2,
            city: req.body.city,
            country: req.body.country,
            state: req.body.state,
            postal_code: req.body.postal_code,
            string: `${req.body.address1} ${req.body.address2} ${req.body.postal_code} 
                    ${req.body.city} ${req.body.state} ${req.body.country}`
        }
        req.session.cart.shipping_cost = getShippingCost(req.body.country, req.body.postal_code);
        req.session.total_cost = parseFloat(req.session.subtotal_cost) + req.session.shipping_cost
    }
    res.send('ok')
    //res.render('cart.ejs', {session: req.session});
})

.post('/add-order', urlencodedParser, function(req, res) {
    // On recupère les infos
    var payment_method = req.body.payment_method
    var billing_address = safeQuote(req.body.billing_address);
    var shipping_address = safeQuote(req.session.cart.shipping_address.string);
    var shipping_method = req.session.cart.shipping_method
    var shipping_cost = parseFloat(req.session.cart.shipping_cost);
    var user_id = req.session.account.id;

    // on refait une liste des produits simplifiée
    var products_obj = [];
    for (var i=0; i<req.session.cart.products.length; i++) {
        products_obj.push({
            id: parseInt(req.session.cart.products[i].id),
            name: escapeQuote(req.session.cart.products[i].name),
            option: req.session.cart.products[i].option,
            nb: parseInt(req.session.cart.products[i].cart_qty),
            price: parseFloat(req.session.cart.products[i].cart_qty * req.session.cart.products[i].price)
        })
    }
    var str_products = JSON.stringify(products_obj);

    // on calcule le prix totale depuis la DB (pour plus de securité)
    var total_cost = 0;
    connection.query('SELECT * FROM products', function(err, rows, fields) {
        if (err) throw err;
        for (var i=0; i<rows.length; i++) {
            for (var j=0; j<products_obj.length; j++) {
                if (products_obj[j].id == rows[i].id) {
                    total_cost += products_obj[j].nb * rows[i].price;
                }
            }
        }

        var subtotal_cost = total_cost
        total_cost = (total_cost+shipping_cost).toFixed(2);
        req.session.cart.subtotal_cost = total_cost;
        req.session.cart.total_cost = total_cost + req.session.shipping_cost; // on en profite pour mettre à jour si jamais

        // requête MySQL
        var addOrder = `INSERT INTO orders (id, date, total_cost, subtotal_cost, shipping_cost, state, user_id, products, shipping_address, billing_address, payment_method, shipping_method) 
                   VALUES (NULL, NOW(), ${total_cost}, ${subtotal_cost}, ${shipping_cost}, 'waiting', ${user_id}, '${str_products}', '${shipping_address}', 
                   '${billing_address}', '${payment_method}', '${shipping_method}')`;

        connection.query(addOrder, function(err, rows, fields) {
            if (err) throw err;

            if (!rows.length) {
                // on envoit un email de confirmation de commande
                sendEmail('order', req.session.account.email, {
                    name: req.session.username,
                    products: req.session.cart.products,
                    subtotal_cost: subtotal_cost,
                    shipping_cost: shipping_cost,
                    total_cost: total_cost,
                    shipping_address: shipping_address,
                    billing_address: billing_address,
                    order_id: ''
                });

                req.session.alert = "add order";
                req.session.cart = 0;// on vide le panier
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

.post('/edit-address', urlencodedParser, function(req, res) {
    console.log("change address");

    var id = req.session.account.id;
    var address1 = req.body.address1;
    var address2 = req.body.address2;
    var postal_code = req.body.postal_code;
    var city = req.body.city;
    var country = req.body.country;
    var state = req.body.state;

    console.log(address1);

    // On construit la requête et on l'envoit (avec check d'erreur)
    var editUser = `UPDATE users SET address1 = '${safeQuote(address1)}', address2 = '${safeQuote(address2)}', city = '${safeQuote(city)}', 
    country = '${country}', state = '${safeQuote(state)}', address2 = '${safeQuote(address2)}', postal_code = '${postal_code}' WHERE users.id = '${id}';`

    connection.query(editUser, function(err, rows, fields) {
        if (err) throw err;

        // Si l'utilisateur a été trouvé
        if (!rows.length) {
            // onmet à jour les cookies
            req.session.alert = "edit account";
            req.session.account.address1 = address1;
            req.session.account.address2 = address2;
            req.session.account.postal_code = postal_code;
            req.session.account.city = city;
            req.session.account.state = state;
            req.session.account.country = country;

            console.log("adress changed !");
            res.send('back'); // on recharge la page
        }
        else {
            console.log("La modification a échoué");
            //req.session.alert = "email already used"; // on stock l'erreur dans la seesion
            res.send('badAddress');
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
    var editUser = `UPDATE users SET name = '${safeQuote(name)}', email = '${email}', tel = '${tel}' WHERE users.email = '${email}';`

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
                    req.session.admin = checkAdmin(email);

                    // On met à jour le panier si jamais
                    req.session.cart = refreshCart(req.session);

                    res.redirect('/');
                } 
                else {
                    req.session.error = "Bad password";
                    res.send('badPassword');
                }
            });
        }
        else {
            req.session.error = "Unknown email";
            res.send('badEmail');
        }
    }); 
})

.post('/sign-up', urlencodedParser, function(req, res) {
    var address1 = safeQuote(req.body.address1);
    var address2 = safeQuote(req.body.address2);
    var city = safeQuote(req.body.city);
    var postalCode = req.body.postalCode;
    var country = safeQuote(req.body.country);
    var state = safeQuote(req.body.state);
	var username = safeQuote(req.body.name);
    var password = req.body.password;
    var newsletter = req.body.newsletter;
    var email = req.body.email;
    var tel = req.body.tel;
    
    // Si la case n'est pas coché -> no
    if (!newsletter) {
        newsletter = 0;
    } else {
        newsletter = 1;
    }

    // On hash le mot de passe à enregistrer dansla DB
    bcrypt.hash(password, 10, function(err, hashedPassword) {
        // On construit la requête et on l'envoit (avec check d'erreur)
        var getUser = `SELECT * FROM users WHERE email='${email}'`; 
        var addUser = `INSERT INTO users (id, name, password, subscribe_date, address1, address2, city, postal_code, state, country, newsletter, email, tel) 
                   VALUES (NULL, '${username}', '${hashedPassword}', NOW(), '${address1}', '${address2}', '${city}', '${postalCode}', '${state}', '${country}', ${newsletter}, '${email}', '${tel}')`;  

        connection.query(getUser, function(err, rows, fields) {
            if (err) throw err;

            // Si l'adresse email n'est pas encore utilisé ...
            if (!rows.length) {
                connection.query(addUser, function(err, rows, fields) {
                    if (err) throw err;

                    // on envoit un email de confirmation
                    sendEmail('subscribe', email, {name: username});
                    req.session.alert = "signup";

                    req.session.alert = "signup";
                    if (email == yanissEmail) {
                        res.redirect('gilbert');
                    }
                    else {
                        res.redirect('/');
                    }
                    
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
    req.session.admin = false;
    req.session.account = false;

    // On met à jour le panier si jamais
    req.session.cart = refreshCart(req.session);

    res.redirect('/');
})

.post('/unsubscribe', urlencodedParser, function(req, res) {
    var requestMysql = `DELETE FROM users WHERE id=${req.session.account.id}`;
    connection.query(requestMysql, function(err, rows, fields) {
        // On envoit un email d'adieu
        sendEmail('unsubscribe', req.session.account.email, {name: req.session.username});

        // On efface les cookies
        req.session.username = '';
        req.session.logged = false;
        req.session.admin = false;
        req.session.account = false;
        req.session.alert = "unsubscribe"

        res.redirect('/');
    }); 
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

// On ouvre le serveur sur le port 8080
console.log('Ouverture du serveur sur le port 8080')
app.listen(8080, 'localhost');