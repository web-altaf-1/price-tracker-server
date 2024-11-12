const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: "http://localhost:5173", // Update this with your frontend URL if needed
  })
);

// Array of site configurations with logo URLs
const sites = [
    {
      name: "Startech",
      urlTemplate: "https://www.startech.com.bd/product/search?search=",
      priceSelector: ".p-item-price span",
      productTitleSelector: ".p-item-name a",
      productImageSelector: ".p-item-img img",
      logoUrl: "https://www.startech.com.bd/image/catalog/logo.png", // Add the logo URL for Startech
    },
    {
      name: "UCC",
      urlTemplate:
        "https://www.ucc.com.bd/index.php?route=product/search&search=",
      priceSelector: "div.price .price-normal", // Updated price selector for UCC
      productTitleSelector: "div.name a", // Updated title selector for UCC
      productImageSelector: ".product-img div img",
      logoUrl: "https://www.ucc.com.bd/image/cache/catalog/UCC/logo/UCC-Logo-600x2x-600x253.png.webp", // Add the logo URL for UCC
    },
  {
    name: "Daraz",
    urlTemplate: "https://www.daraz.com.bd/catalog/?q=",
    priceSelector: "div.aBrP0 span.ooOxS",
    productTitleSelector: "div.RfADt a",
    productImageSelector: "div.picture-wrapper img",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Daraz_Logo.png/800px-Daraz_Logo.png", // Add the logo URL for Daraz
  },
  // Add more sites here as needed
];

const scrapeSite = async (site, productName) => {
  const results = [];
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if ([ "font"].includes(req.resourceType())) {
        req.abort(); // Abort requests for images, stylesheets, and fonts
      } else {
        req.continue(); // Continue all other requests
      }
    });

    const searchUrl = `${site.urlTemplate}${encodeURIComponent(productName)}`;
    await page.goto(searchUrl, { waitUntil: "networkidle2" });
    const products = await page.evaluate(
      (titleSelector, priceSelector, imageSelector, productName) => {
        const productElements = document.querySelectorAll(titleSelector);
        const priceElements = document.querySelectorAll(priceSelector);
        const imageElements = document.querySelectorAll(imageSelector);
        const productData = [];

        const lowerCaseProductName = productName.toLowerCase();

        productElements.forEach((el, index) => {
          const productTitle = el.innerText.trim();
          const productLink = el.href;
          const rawPrice = priceElements[index]?.innerText.trim() || "N/A";
          const productImageUrl = imageElements[index]?.src || null;
          const lowerCaseProductTitle = productTitle.toLowerCase();
          const numericPrice = parseFloat(rawPrice.replace(/[^0-9.]/g, ""));

          if (
            !isNaN(numericPrice) &&
            lowerCaseProductTitle.includes(lowerCaseProductName)
          ) {
            productData.push({
              title: productTitle,
              link: productLink,
              price: rawPrice,
              numericPrice,
              imageUrl: productImageUrl, // Add image URL to the data
            });
          }
        });
        return productData;
      },
      site.productTitleSelector,
      site.priceSelector,
      site.productImageSelector,
      productName
    );

    products.forEach((product) => {
      results.push({
        site: site.name,
        productTitle: product.title,
        price: product.price,
        numericPrice: product.numericPrice, // Ensure numericPrice is included
        url: product.link,
        imageUrl: product.imageUrl, // Add the image URL for each result
        logoUrl: site.logoUrl, // Add the logo URL for each result
      });
    });
  } catch (error) {
    console.error(`Error scraping ${site.name}:`, error);
  } finally {
    await browser.close();
  }
  return results;
};

app.post("/search", async (req, res) => {
  const { productName } = req.body;

  if (!productName) {
    return res.status(400).json({ error: "Product name is required" });
  }

  try {
    const allResults = [];
    for (const site of sites) {
      const siteResults = await scrapeSite(site, productName);
      allResults.push(...siteResults); // Merge all results into one array
    }

    // Sort all results by numeric price after collecting all data
    allResults.sort((a, b) => a.numericPrice - b.numericPrice);

    res.json({ productName, results: allResults });
  } catch (error) {
    console.error("Error during scraping:", error);
    res.status(500).json({ error: "Failed to scrape product data" });
  }
});

const PORT = 8080;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
