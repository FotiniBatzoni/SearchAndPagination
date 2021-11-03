const express = require("express");
const router = express.Router();
const multer = require("multer");
const { isValidObjectId } = require("mongoose");
const _ = require("lodash");
const auth = require("../../middleware/auth");
const isLoggedIn = require("../../middleware/isLoggedIn");
const isAdmin = require("../../middleware/isAdmin");
const convertVariationToObject = require("../../middleware/convertVariationToObject");
const convertGalleryToArray = require("../../middleware/convertGalleryToArray");
const { Variation } = require("../../models/variation");
const {
  Product,
  transformArrayProductsImages,
  transformSingleProductsImages,
  validate,
  validatePatchProduct
} = require("../../models/product");
const { ProductCat } = require("../../models/productCat");
const {
  checkProductGallery,
  setProductGallery,
  deleteProductGallery,
} = require("../../utilities/handleProductGallery");
const paginateDocuments = require("../../utilities/paginateDocuments")

const util = require("util");
const {VariationItem} = require("../../models/variationItem");

//const storage = multer.memoryStorage();
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (
    Array.isArray(req.files["featured_image"]) &&
    req.files["featured_image"].length > 9
  ) {
    cb(new Error("Οι εικόνες δεν μπορούν να ξεπερνάνε τις 8"));
  }

  if (file.size > 2000000) {
    cb(new Error("Ένα ή περισσότερα αρχεία ξεπερνούν τα 2MB"));
  }

  if (
    file.mimetype !== "image/jpeg" &&
    file.mimetype !== "image/jpg" &&
    file.mimetype !== "image/png"
  ) {
    cb(new Error("Παρακαλώ εισάγετε εικόνες τύπου jpeg ή png"));
  }
  cb(null, true);
};

const upload = multer({ storage: storage, fileFilter: fileFilter });
const uploadImages = upload.fields([{ name: "gallery" }]);

router.get("/", [auth,isLoggedIn,isAdmin] , async (req, res) => {
  let productsQuery = Product.find({ store: req.storeId })
    .populate({ path: "product_cat", select: { _id: 1, name: 1 } })
    .populate({ path: "variations.variation", select: { _id: 1, name: 1 } });

  let productsCounter= await Product.countDocuments({ store: req.storeId });

  const url = `${req.protocol}://${req.get("host")}/api/admin/stores/${req.storeId}/products`

  let products = await paginateDocuments(req.query,productsQuery,productsCounter,url);

  products.documents = transformArrayProductsImages(req,products.documents)

  return res.send(products);
});


router.get("/search",[auth,isLoggedIn,isAdmin], async (req,res)=>{
  let param = req.query.q;

  function isNumeric(param){
    return !isNaN(param)
  }

  let searchQuery={};
   searchQuery.store ={$in:req.storeId.toString()};

  if(isNumeric(param)){
    searchQuery.price = param;
  }else{
    searchQuery.$or=[
        { name: { $regex: diacriticSensitiveRegex(param) + ".*", $options: "i" } },
        { description: { $regex: diacriticSensitiveRegex(param) + ".*", $options: "i" } },
        { slug: { $regex: diacriticSensitiveRegex(param) + ".*", $options: "i" } },
      ]
    }



  let dbSearch =  Product.find(searchQuery);

  let dbCount = await Product.countDocuments(searchQuery);

  const url = `${req.protocol}://${req.get("host")}/api/admin/products`

  let productsSearch = await paginateDocuments(req.query,dbSearch,dbCount,url);

  return res.send(productsSearch)

})


router.get("/:productId",[auth,isLoggedIn,isAdmin] ,   async (req, res) => {
  if (!isValidObjectId(req.params.productId))
    return res.status(404).send({ message: "Δεν βρέθηκε το προϊόν" });
  let product = await Product.findOne({
    _id: req.params.productId,
    store: req.storeId,
  })
    .populate({ path: "product_cat", select: { _id: 1, name: 1 } })
    .populate({ path: "variations.variation", select: { _id: 1, name: 1 } });
  if (!product)
    return res.status(404).send({ message: "Δεν βρέθηκε το προϊόν" });
  product = transformSingleProductsImages(req, product);
  return res.send(product);
});

router.post(
  "/",
  [auth, isLoggedIn, isAdmin, uploadImages, convertVariationToObject],
  async (req, res) => {
    const { error } = validate(req.body);
    // console.log(error)
    if (error)
      return res.status(400).send({ message: error.details[0].message });

    const prodCat = await ProductCat.findOne({
      _id: req.body.product_cat,
      store: req.storeId,
    });
    if (!prodCat)
      return res
        .status(404)
        .send({ message: "Δεν βρέθηκε η κατηγορία προϊόντος" });

    if (req.body.variations.length > 0) {
      for (let [i, v] of req.body.variations.entries()) {
        const variation = await Variation.findOne({
          _id: v.variation,
          store: req.storeId,
        });
        if (!variation)
          return res
            .status(404)
            .send({ message: "Δεν βρέθηκε το έξτρα που εισάγατε" });

        // if(v.multipleSelect.min && v.multipleSelect.max && (v.multipleSelect.min > v.multipleSelect.max)){
        //     return res.status(422).send({message:"Ο αριθμός ελάχιστων επιλογών δεν πρέπει να υπερβαίνει του μέγιστου"})
        // }
        if (
          v.isRequired &&
          v.multipleSelect.isMultiple &&
          (v.multipleSelect.min === 0 || v.multipleSelect.max === 0)
        ) {
          return res.status(422).send({
            message:
              "Σε περίπτωση υποχρεωτικού πολλαπλού πεδίου με μέγιστο και ελάχιστο, οι τιμές δεν πρέπει να είναι μηδενικές",
          });
        }

        if (
          v.multipleSelect.isMultiple &&
          v.multipleSelect.min > v.multipleSelect.max
        ) {
          return res.status(422).send({
            message:
              "Ο αριθμός ελάχιστων επιλογών δεν πρέπει να υπερβαίνει του μέγιστου σε περίπτωση ορισμού μέγιστων-ελάχιστων επιλογών",
          });
        }
      }
    }

    if (!checkProductGallery(req, null, "products", "gallery")) {
      return res
        .status(422)
        .send({ message: "Παρακαλώ ελέγξτε τις εικόνες που ανεβάσατε" });
    }

    let input = _.pick(req.body, [
      "name",
      "description",
      "price",
      "quantity",
      "variations",
      "product_cat",
      "isActive",
    ]);
    input = { ...input, store: req.storeId };
    const product = new Product(input);
    product.priority = req.body.priority ? req.body.priority : 0;
    await product.save();
    const gallery = setProductGallery(req, product, "products", "gallery");
    product.gallery = gallery;
    await product.save();
    await ProductCat.updateMany(
      { _id: req.body.product_cat },
      { $push: { products: product._id } }
    );
    return res.send({ message: "Η καταχώρηση προϊόντος ήταν επιτυχής" });
  }
);

router.put(
  "/:productId",
  [
    auth,
    isLoggedIn,
    isAdmin,
    uploadImages,
    convertVariationToObject,
    convertGalleryToArray,
  ],
  async (req, res) => {
    if (!isValidObjectId(req.params.productId))
      return res.status(404).send({ message: "Δεν βρέθηκε το προϊόν" });
    let product = await Product.findOne({
      _id: req.params.productId,
      store: req.storeId,
    })
      .populate({ path: "product_cat", select: { _id: 1, name: 1 } })
      .populate({ path: "variations.variation", select: { _id: 1, name: 1 } });
    if (!product)
      return res.status(404).send({ message: "Δεν βρέθηκε το προϊόν" });
    console.log(
      util.inspect(req.body, { showHidden: false, depth: null, colors: true })
    );
    const { error } = validate(req.body);
    if (error)
      return res.status(400).send({ message: error.details[0].message });

    const prodCat = await ProductCat.findOne({
      _id: req.body.product_cat,
      store: req.storeId,
    });
    if (!prodCat)
      return res
        .status(404)
        .send({ message: "Δεν βρέθηκε η κατηγορία προϊόντος" });

    if (req.body.variations.length > 0) {
      for (let [i, v] of req.body.variations.entries()) {
        const variation = await Variation.findOne({
          _id: v.variation,
          store: req.storeId,
        });
        if (!variation)
          return res
            .status(404)
            .send({ message: "Δεν βρέθηκε το έχτρα που είσάγατε" });

        // if(v.multipleSelect.min && v.multipleSelect.max && (v.multipleSelect.min > v.multipleSelect.max)){
        //     return res.status(422).send({message:"Ο αριθμός ελάχιστων επιλογών δεν πρέπει να υπερβαίνει του μέγιστου"})
        // }
        if (
          v.isRequired &&
          v.multipleSelect.isMultiple &&
          (v.multipleSelect.min === 0 || v.multipleSelect.max === 0)
        ) {
          return res.status(422).send({
            message:
              "Σε περίπτωση υποχρεωτικού πολλαπλού πεδίου με μέγιστο και ελάχιστο, οι τιμές δεν πρέπει να είναι μηδενικές",
          });
        }

        if (
          v.multipleSelect.isMultiple &&
          v.multipleSelect.min > v.multipleSelect.max
        ) {
          return res.status(422).send({
            message:
              "Ο αριθμός ελάχιστων επιλογών δεν πρέπει να υπερβαίνει του μέγιστου σε περίπτωση ορισμού μέγιστων-ελάχιστων επιλογών",
          });
        }
      }
    }

    if (!checkProductGallery(req, product, "products", "gallery")) {
      return res
        .status(422)
        .send({ message: "Παρακαλώ ελέγξτε τις εικόνες που ανεβάσατε" });
    }

    let changeProductCat = false;
    if (req.body.product_cat !== product.product_cat.toString()) {
      changeProductCat = true;
    }

    let input = _.pick(req.body, [
      "name",
      "description",
      "price",
      "variations",
      "product_cat",
      "isActive",
    ]);
    product.name = input.name;
    product.description = input.description ? input.description : "";
    product.price = input.price;
    product.variations = input.variations;
    product.product_cat = input.product_cat;
    product.priority = req.body.priority ? req.body.priority : 0;
    product.isActive = req.body.isActive;
    await product.save();
    const gallery = setProductGallery(req, product, "products", "gallery");
    product.gallery = gallery;
    await product.save();

    if (changeProductCat) {
      await ProductCat.updateMany(
        { products: req.params.productId, store: req.storeId },
        { $pull: { products: req.params.productId } }
      );
      await ProductCat.updateOne(
        { _id: req.body.product_cat },
        { $push: { products: req.params.productId } }
      );
    }

    return res.send({ message: "Η καταχώρηση προϊόντος ήταν επιτυχής" });
  }
);

router.patch("/:productId",[auth,isLoggedIn,isAdmin],async(req,res)=>{
  if (!isValidObjectId(req.params.productId))
    return res.status(404).send({ message: "Δεν βρέθηκε το προϊόν" });
  let product = await Product.findOne({
    _id: req.params.productId
  })

  if (!product)
    return res.status(404).send({ message: "Δεν βρέθηκε το προϊόν" });
  const { error } = validatePatchProduct(req.body);
  if (error)
    return res.status(400).send({ message: error.details[0].message });

  if(Object.keys(req.body).length === 0){
    return res.send({message:"Δεν υπήρξε ενημέρωση γιατί δεν υπήρξε αλλαγή"})
  }

  if(req.body.product_cat){
    const prodCat = await ProductCat.findOne({
      _id: req.body.product_cat,
      store: req.storeId,
    });
    if (!prodCat)
      return res
          .status(404)
          .send({ message: "Δεν βρέθηκε η κατηγορία προϊόντος" });
  }


  delete req.body._id;
  delete req.body.variations;

  await Product.findByIdAndUpdate(req.params.productId,req.body);

  return res.send({message:"Το προϊόν ενημερώθηκε επιτυχώς"})

})

router.delete("/:productId", [auth, isLoggedIn, isAdmin], async (req, res) => {
  if (!isValidObjectId(req.params.productId))
    return res.status(404).send({ message: "Δεν βρέθηκε το προϊόν" });
  let product = await Product.findOne({
    _id: req.params.productId,
    store: req.storeId,
  })
    .populate({ path: "product_cat", select: { _id: 1, name: 1 } })
    .populate({ path: "variations.variation", select: { _id: 1, name: 1 } });
  if (!product)
    return res.status(404).send({ message: "Δεν βρέθηκε το προϊόν" });
  await Product.deleteOne({ _id: req.params.productId });
  deleteProductGallery(req, product, "products");
  await ProductCat.updateMany(
    { products: req.params.productId, store: req.storeId },
    { $pull: { products: req.params.productId } }
  );

  return res.send({ message: "Το προϊόν διαγράφτηκε επιτυχώς" });
});

module.exports = router;

function diacriticSensitiveRegex(string = '') {
  return string.replace(/α/g, '[α,ά]')
      .replace(/ε/g, '[ε,έ]')
      .replace(/η/g, '[η,ή]')
      .replace(/ο/g, '[ο,ό]')
      .replace(/ω/g, '[ω,ώ]')
      .replace(/ι/g, '[ι,ί,ϊ]')
      .replace(/υ/g, '[υ,ύ,ϋ]');
}