
// Variables d'initalisation de Node
var express = require('express');
var session = require('express-session');
var bodyParser = require("body-parser");
//var redis = require("redis");
//var redisStore = require("connect-redis")(session);
var bcrypt = require('bcryptjs');
var multer  = require('multer')
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './public/img')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
})
var upload = multer({storage: storage})

// Set your secret key. Remember to switch to your live secret key in production!
// See your keys here: https://dashboard.stripe.com/account/apikeys
const stripe = require('stripe')('sk_test_0HJaHUkSg3JE8rkO4P4weCJS00cB00h5K9');

//var client = redis.createClient();
var app = express();

// init mailjet
var mailjetApi = '3fd803f3c9719849951a788982dbfe72';
var mailjetSecretKeys = '9b4e9cabdf8f2c58ee2221d34a6d8bf0';
const mailjet = require ('node-mailjet').connect(mailjetApi, mailjetSecretKeys)

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
        cookie: { maxAge: 10*60*1000 }, // in millisecond
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

// ============================================= GLOBAL FUNCTIONS ========================================

// ---------------------------- USER -----------------------

// Liste des email (utilisateur) ayant accès au droit admin (gestion des articles)
var admin_user = ['arouxel@outlook.fr', 'yoann.dogbe@gmail.com']
function checkAdmin(email) {
    return admin_user.includes(email)
}

// ---------------------------- EMAIL ----------------------- 

var subscriptionTemplate = 1323172;
var commandTemplate = 1323206;
function sendEmailSubscription(email, name) {
    // Send email via mailjet
    mailjet
    .post("send", {'version': 'v3.1'})
    .request({
      "Messages":[
            {
            "TemplateLanguage": true,
            "To": [{
                "Email": email,
                "Name": name
            }],
            "TemplateID": subscriptionTemplate,
            "Variables": {
                'name': name,
                }
            }
        ]
    })
    .then(function (result) {
        console.log(result.body)
    })
    .catch(function (err) {
        console.log(err)

    })
}

function sendEmailCommand(email, name, infos) {
    // Send email via mailjet
    console.log(infos.products)
    mailjet
    .post("send", {'version': 'v3.1'})
    .request({
      "Messages":[
            {
            "TemplateLanguage": true,
            "To": [{
                "Email": email,
                "Name": name
            }],
            "TemplateID": commandTemplate,
            "Variables": {
                name: name,
                products: infos.products,
                shipping_cost: infos.shipping_cost,
                subtotal_cost: infos.subtotal_cost,
                total_cost: infos.total_cost,
                shipping_address: infos.shipping_address,
                billing_address: infos.billing_address,
                order_id: infos.order_id
                }
            }
        ]
    })
    .then(function (result) {
        console.log(result.body)
    })
    .catch(function (err) {
        console.log(err)
    })
}

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
    req.session.admin = false;
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
            reference: product.id,
            name: product.name,
            stocks: product.stocks,
            price: product.price,
            description: product.description,
            size: product.size,
            printing: product.printing,
            category: product.category,
            img: JSON.parse(product.images),
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
                img: JSON.parse(product.images),
                session: req.session});
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

        var shipping_cost = parseFloat(req.session.cart.shipping_cost);
        subtotal_cost = total_cost
        total_cost = (total_cost+shipping_cost).toFixed(2);
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
        var name = req.body.name;
        var description = req.body.description;
        var price = req.body.price;
        var size = req.body.size;
        var printing = req.body.printing;
        var category = req.body.category;
        var img_list = req.body.images;

        var addProduct = `INSERT INTO products (name, description, price, size, printing, category, images) 
            VALUES ("${name}", "${description}", "${price}", "${size}", "${printing}", "${category}", '${img_list}')`;  
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
        var name = req.body.name;
        var description = req.body.description;
        var price = req.body.price;
        var size = req.body.size;
        var printing = req.body.printing;
        var category = req.body.category;
        var img_list = req.body.images;

        var addProduct = `UPDATE products SET name = '${name}', description = '${description}', price = '${price}', 
            size = '${size}', printing = '${printing}', category = '${category}', images = '${img_list}' WHERE products.id = '${id}'`;  
        connection.query(addProduct, function(err, rows, fields) {
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

.post('/upload-img', upload.any(), function(req, res) {
    console.log('files uploaded: ');
    console.log(req.files);
    res.send('back');
})

// ----------------------- PAYOUT OPTION  ---------------------------

.post('/add-cart', urlencodedParser, function(req, res) {
    // si il n'y a pas encore cookies de panier, on en créer un
    if (!req.session.cart) {
        req.session.cart = {
            products: [],
            subtotal_cost: '0',
            shipping_cost: '0',
            total_cost: '0',
        }
    }

    var product_id = req.body.id;
    var match = false;
    // Si le produit est déjà dans le panier, on l'incremente
    for (var i=0; i<req.session.cart.products.length; i++) {
        if (req.session.cart.products[i].id == product_id) {
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
    if (req.session.id) {
        for (var i=0; i<req.session.cart.products.length; i++) {
            if (req.session.cart.products[i].id == req.body.id) req.session.cart.products.splice(i, 1);
        }
    }
    if (!req.session.cart.products.length) {
        req.session.cart = 0;
    }
    res.redirect('back');
})

.post('/valid-cart', urlencodedParser, function(req, res) {
    // on remplace le panier par celui envoyé (en le convertissant)
    req.session.cart.products = JSON.parse(req.body['cart']);
    req.session.cart.subtotal_cost = req.body.subtotal_cost;
    req.session.cart.shipping_cost = req.body.shipping_cost;
    req.session.cart.total_cost = req.body.total_cost;

    res.send('ok')
    //res.render('cart.ejs', {session: req.session});
})

.post('/add-order', urlencodedParser, function(req, res) {
    // On recupère les infos
    var payment_method = req.body.payment_method
    var billing_address = req.body.billing_address;
    var shipping_address = req.session.cart.shipping_address.string;
    var shipping_method = req.session.cart.shipping_method
    var shipping_cost = parseFloat(req.session.cart.shipping_cost);
    var user_id = req.session.account.id;

    // on refait une liste des produits simplifiée
    var products_obj = [];
    for (var i=0; i<req.session.cart.products.length; i++) {
        products_obj.push({
            id: parseInt(req.session.cart.products[i].id),
            nb: parseInt(req.session.cart.products[i].cart_qty),
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
                   VALUES (NULL, NOW(), ${total_cost}, ${subtotal_cost}, ${shipping_cost}, 'En attente', ${user_id}, '${str_products}', '${shipping_address}', 
                   '${billing_address}', '${payment_method}', '${shipping_method}')`;

        connection.query(addOrder, function(err, rows, fields) {
            if (err) throw err;

            if (!rows.length) {
                // on envoit un email de confirmation de commande
                console.log(rows)
                sendEmailCommand(req.session.account.email, req.session.account.name, 
                    {
                        products: req.session.cart.products,
                        subtotal_cost: subtotal_cost,
                        shipping_cost: shipping_cost,
                        total_cost: total_cost,
                        shipping_address: shipping_address,
                        billing_address: billing_address,
                        order_id: ''
                    }
                );

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

.post('/valid-shipping', urlencodedParser, function(req, res) {
    // valide et enregistre les paramètre de livraison
    req.session.cart.shipping_method = req.body.shippingMethod;
    req.session.cart.shipping_cost = '4.95'; // par défaut on met la livraison à 4.95€

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
    }
    res.send('ok')
    //res.render('cart.ejs', {session: req.session});
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
                    console.log("logged !");
                    res.redirect('/');
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
    var address1 = req.body.address1;
    var address2 = req.body.address2;
    var city = req.body.city;
    var postalCode = req.body.postalCode;
    var country = req.body.country;
    var state = req.body.state;
	var username = req.body.name;
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
                   VALUES (NULL, "${username}", "${hashedPassword}", NOW(), "${address1}", "${address2}", "${city}", "${postalCode}", "${state}", "${country}", ${newsletter}, "${email}", "${tel}")`;  

        connection.query(getUser, function(err, rows, fields) {
            if (err) throw err;

            // Si l'adresse email n'est pas encore utilisé ...
            if (!rows.length) {
                connection.query(addUser, function(err, rows, fields) {
                    if (err) throw err;
                    // on envoit un email de confirmation
                    sendEmailSubscription(email, username);

                    req.session.alert = "signup";
                    res.redirect('back');
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
app.listen(8080, 'localhost');