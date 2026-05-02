import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import cookieSession from "cookie-session";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Generic API Proxy for Fireant
  app.all("/api/fireant/*", async (req, res) => {
    try {
      const targetPath = req.params[0];
      const query = new URLSearchParams(req.query as any).toString();
      const url = `https://restv2.fireant.vn/${targetPath}${query ? `?${query}` : ""}`;
      
      // Get a fresh token if not provided by client
      let token = req.headers.authorization;
      if (!token || token === 'Bearer undefined' || token === 'undefined') {
        token = await getFireantToken();
        if (token && !token.startsWith('Bearer ')) {
          token = `Bearer ${token}`;
        }
      }

      const fetchWithToken = async (authToken: string | undefined) => {
        const headers: any = {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://fireant.vn/',
          'Origin': 'https://fireant.vn',
          'X-Requested-With': 'XMLHttpRequest'
        };
        
        if (authToken) {
          headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
        }

        return await axios({
          method: req.method,
          url: url,
          headers,
          data: req.body,
          timeout: 20000,
          validateStatus: (status) => status < 500 // Don't throw for 40x so we can handle them manually
        });
      };

      let response = await fetchWithToken(token);
      
      // If 401, try refreshing the token once
      if (response.status === 401) {
        console.log(`[Proxy] 401 detected for ${targetPath}, attempting token refresh...`);
        const freshToken = await getFireantToken(true);
        if (freshToken) {
          response = await fetchWithToken(freshToken);
          console.log(`[Proxy] Retry for ${targetPath} resulted in status: ${response.status}`);
        }
      }
      
      res.status(response.status).json(response.data);
    } catch (error: any) {
      console.error(`Error proxying Fireant [${req.method}] ${req.params[0]}:`, error.message);
      res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to proxy request" });
    }
  });

  // Server-side cache for news to handle slow source
  let newsCache: any = null;
  let lastCacheUpdate = 0;
  let isRefreshingNews = false;
  const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  const FINANCE_FALLBACKS = [
    "https://images.unsplash.com/photo-1611974717482-58a2523e16c2?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1526303328184-bf7159787ca7?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1633156191771-7a55444e998b?q=80&w=800&auto=format&fit=crop"
  ];

  const getFallbackImage = (id: string | number) => {
    const idx = typeof id === 'number' ? id % FINANCE_FALLBACKS.length : (id.length % FINANCE_FALLBACKS.length);
    return FINANCE_FALLBACKS[idx];
  };

  const refreshNews = async (retryCount = 0) => {
    if (isRefreshingNews && retryCount === 0) return;
    isRefreshingNews = true;
    
    try {
      console.log(`Background: Refreshing news from Fireant (Attempt ${retryCount + 1})...`);
      const response = await axios.get("https://fireant.vn/bai-viet", {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8'
        }
      });
      
      const html = response.data;
      const scriptTag = '<script id="__NEXT_DATA__" type="application/json">';
      const startIdx = html.indexOf(scriptTag);
      
      if (startIdx === -1) {
        throw new Error("Could not find __NEXT_DATA__ script tag");
      }
      
      const jsonStart = html.indexOf('{', startIdx);
      const scriptEndIdx = html.indexOf('</script>', jsonStart);
      const jsonStr = html.substring(jsonStart, scriptEndIdx);
      
      const data = JSON.parse(jsonStr);
      
      // Navigate through the Next.js state object to find the posts
      // Structure: props.pageProps.initialState.posts.posts.NEWS_STREAM.posts
      const newsStream = data?.props?.pageProps?.initialState?.posts?.posts?.NEWS_STREAM;
      const posts = newsStream?.posts;
      
      if (!posts || !Array.isArray(posts)) {
        throw new Error("Could not find posts array in __NEXT_DATA__");
      }

      // Map to our NewsItem format
      const mappedNews = posts.map((post: any) => {
        const title = post.title || "";
        const summary = post.description || post.summary || "";
        
        // Comprehensive image extraction helper
        const extractImage = (post: any) => {
          let img = post.images?.[0]?.imageUrl || 
                    (post.images?.[0]?.imageID ? `https://static.fireant.vn/News/Image/${post.images[0].imageID}` : null) ||
                    post.thumbnail || 
                    post.linkImage;
          
          if (!img) {
            // Search in HTML content for common image attributes
            const contentToSearch = post.content || post.originalContent || post.description || post.summary || "";
            // Find all images and pick the first one that looks like a real image
            const imgMatches = Array.from(contentToSearch.matchAll(/<img[^>]+(?:src|data-src|srcset)=["']([^"'\s>]+)["']/gi));
            if (imgMatches.length > 0) {
              // Prefer images that aren't tiny icons or trackers
              const likelyImg = imgMatches.find(m => !m[1].includes('icon') && !m[1].includes('logo')) || imgMatches[0];
              img = likelyImg[1];
            }
          }

          if (img && typeof img === 'string') {
            if (img.startsWith('//')) {
              img = `https:${img}`;
            } else if (img.startsWith('/')) {
              img = `https://static.fireant.vn${img}`;
            }
          }
          return img;
        };

        let image = extractImage(post);
        
        // Final fallback to global image if still missing
        if (!image) {
          image = getFallbackImage(post.postID || 0);
        }

        // Collect all images from the images array
        const allImages = (post.images || []).map((img: any) => {
          let url = img.imageUrl || (img.imageID ? `https://static.fireant.vn/News/Image/${img.imageID}` : null);
          if (url && typeof url === 'string') {
            if (url.startsWith('//')) url = `https:${url}`;
            else if (url.startsWith('/')) url = `https://static.fireant.vn${url}`;
          }
          return url;
        }).filter(Boolean);

        // Add the primary image to the collection if not present
        if (image && !allImages.includes(image)) {
          allImages.unshift(image);
        }

        // Use the most complete content field available
        const contentText = post.content || post.originalContent || post.description || post.summary || title;

        return {
          id: post.postID?.toString() || `fa-${Date.now()}-${Math.random()}`,
          source: post.postSource?.name || post.user?.name || 'Fireant',
          sourceUrl: post.postSource?.url || null,
          title: title,
          summary: summary,
          content: contentText,
          author: post.user?.name || 'Fireant',
          image: image || globalFallbackImage,
          images: allImages,
          date: post.date,
          url: `https://fireant.vn/bai-viet/${post.postID}`,
          originalUrl: post.postSourceUrl || post.link || null,
          category: post.postGroup?.name || 'Thị trường'
        };
      });
      
      newsCache = mappedNews;
      lastCacheUpdate = Date.now();
      console.log(`Background: News refreshed successfully (${mappedNews.length} items).`);
      isRefreshingNews = false;
    } catch (error: any) {
      console.error(`Background: News refresh failed: ${error.message}`);
      
      if (retryCount < 3) {
        const delay = 5000;
        setTimeout(() => refreshNews(retryCount + 1), delay);
        isRefreshingNews = true;
        return;
      }
      
      if (!newsCache) {
        newsCache = []; 
        lastCacheUpdate = Date.now();
      }
      isRefreshingNews = false;
    }
  };

  // Initial fetch to populate cache on startup
  refreshNews();

  let fireantToken: string | null = null;
  let globalFallbackImage: string | null = "https://images.unsplash.com/photo-1611974717482-58a2523e16c2?q=80&w=2070&auto=format&fit=crop";
  let lastTokenFetch = 0;

  async function getFireantToken(force = false) {
    const now = Date.now();
    // Cache token and fallback image for 30 minutes, unless forced
    if (!force && fireantToken && (now - lastTokenFetch < 30 * 60 * 1000)) {
      return fireantToken;
    }

    try {
      console.log(`[Token] Fetching new access token (force=${force})...`);
      const response = await axios.get('https://fireant.vn/bai-viet', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 10000
      });
      const html = response.data;
      const scriptTag = '<script id="__NEXT_DATA__" type="application/json">';
      const startIdx = html.indexOf(scriptTag);
      
      if (startIdx !== -1) {
        const jsonStart = html.indexOf('{', startIdx);
        const scriptEndIdx = html.indexOf('</script>', jsonStart);
        const jsonStr = html.substring(jsonStart, scriptEndIdx);
        const data = JSON.parse(jsonStr);
        
        // Enhanced token search - search recursively for tokens if common paths fail
        const findTokenRecursively = (obj: any): string | null => {
          if (!obj || typeof obj !== 'object') return null;
          
          if (obj.accessToken && typeof obj.accessToken === 'string' && obj.accessToken.length > 20) return obj.accessToken;
          if (obj.token && typeof obj.token === 'string' && obj.token.length > 20) return obj.token;
          
          for (const key in obj) {
            if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
              const res = findTokenRecursively(obj[key]);
              if (res) return res;
            }
          }
          return null;
        };

        const token = data?.props?.pageProps?.initialState?.auth?.accessToken || 
                      data?.props?.pageProps?.initialState?.auth?.token ||
                      findTokenRecursively(data);
        
        if (token) {
          fireantToken = token;
          lastTokenFetch = now;
          console.log(`[Token] Successfully obtained Fireant access token: ${token.substring(0, 15)}...`);
        } else {
          console.warn("[Token] Access token not found in __NEXT_DATA__");
        }

        // Try to get a fallback image
        const newsStream = data?.props?.pageProps?.initialState?.posts?.posts?.NEWS_STREAM;
        const firstPost = newsStream?.posts?.[0];
        if (firstPost) {
          let fallbackImg = firstPost.images?.[0]?.imageUrl || 
                            (firstPost.images?.[0]?.imageID ? `https://static.fireant.vn/News/Image/${firstPost.images[0].imageID}` : null) ||
                            firstPost.thumbnail ||
                            firstPost.linkImage;
          
          if (fallbackImg) {
            if (typeof fallbackImg === 'string' && fallbackImg.startsWith('/')) {
              fallbackImg = `https://static.fireant.vn${fallbackImg}`;
            }
            globalFallbackImage = fallbackImg;
            console.log("[Token] Obtained global fallback image:", globalFallbackImage);
          }
        }
        
        return token;
      } else {
        console.error("[Token] Could not find __NEXT_DATA__ on Fireant main page");
      }
    } catch (error: any) {
      console.error("[Token] Failed to fetch Fireant token/image:", error.message);
    }
    return fireantToken;
  }

  // API to fetch full content for a specific post
  app.get("/api/news/:id", async (req, res) => {
    const postId = req.params.id;
    if (!postId) return res.status(400).json({ error: "Post ID is required" });

    try {
      // Try REST API with token first
      const token = await getFireantToken();
      if (token) {
        try {
          console.log(`Fetching full content for post ${postId} via REST API with token...`);
          const apiResponse = await axios.get(`https://restv2.fireant.vn/posts/get-post?postID=${postId}`, {
            timeout: 10000,
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            }
          });

          if (apiResponse.data) {
            const post = apiResponse.data;
            const title = post.title || "";
            const summary = post.description || post.summary || "";
            
            // Comprehensive image extraction helper
            const extractImage = (p: any) => {
              let img = p.images?.[0]?.imageUrl || 
                        (p.images?.[0]?.imageID ? `https://static.fireant.vn/News/Image/${p.images[0].imageID}` : null) ||
                        p.thumbnail || 
                        p.linkImage;
              
              if (!img) {
                const contentToSearch = p.content || p.originalContent || p.description || p.summary || "";
                const imgMatches = Array.from(contentToSearch.matchAll(/<img[^>]+(?:src|data-src|srcset)=["']([^"'\s>]+)["']/gi));
                if (imgMatches.length > 0) {
                  const likelyImg = imgMatches.find(m => !m[1].includes('icon') && !m[1].includes('logo')) || imgMatches[0];
                  img = likelyImg[1];
                }
              }

              if (img && typeof img === 'string') {
                if (img.startsWith('//')) img = `https:${img}`;
                else if (img.startsWith('/')) img = `https://static.fireant.vn${img}`;
              }
              return img;
            };

            let image = extractImage(post) || getFallbackImage(postId);

            // Collect all images
            const allImages = (post.images || []).map((img: any) => {
              let url = img.imageUrl || (img.imageID ? `https://static.fireant.vn/News/Image/${img.imageID}` : null);
              if (url && typeof url === 'string') {
                if (url.startsWith('//')) url = `https:${url}`;
                else if (url.startsWith('/')) url = `https://static.fireant.vn${url}`;
              }
              return url;
            }).filter(Boolean);

            if (image && !allImages.includes(image)) {
              allImages.unshift(image);
            }
            
            return res.json({
              id: post.postID?.toString(),
              source: post.postSource?.name || post.user?.name || 'Fireant',
              sourceUrl: post.postSource?.url || null,
              title: title,
              summary: summary,
              content: post.content || post.originalContent || summary || title,
              author: post.user?.name || 'Fireant',
              image: image,
              images: allImages,
              date: post.date,
              url: `https://fireant.vn/bai-viet/${post.postID}`,
              originalUrl: post.postSourceUrl || post.link || null,
              category: post.postGroup?.name || 'Thị trường'
            });
          }
        } catch (apiError: any) {
          console.log(`REST API with token failed for post ${postId}: ${apiError.message}`);
        }
      }

      // Fallback to scraping if REST API fails or no token
      console.log(`Falling back to scraping for post ${postId}...`);
      const response = await axios.get(`https://fireant.vn/bai-viet/${postId}`, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        }
      });
      
      const html = response.data;
      const scriptTag = '<script id="__NEXT_DATA__" type="application/json">';
      const startIdx = html.indexOf(scriptTag);
      
      if (startIdx !== -1) {
        const jsonStart = html.indexOf('{', startIdx);
        const scriptEndIdx = html.indexOf('</script>', jsonStart);
        const jsonStr = html.substring(jsonStart, scriptEndIdx);
        const data = JSON.parse(jsonStr);
        
        // Find the post in the detailed page state
        const post = data?.props?.pageProps?.initialState?.posts?.post;
        
        if (post) {
          const title = post.title || "";
          const summary = post.description || post.summary || "";
          
          // Comprehensive image extraction helper
          const extractImage = (p: any) => {
            let img = p.images?.[0]?.imageUrl || 
                      (p.images?.[0]?.imageID ? `https://static.fireant.vn/News/Image/${p.images[0].imageID}` : null) ||
                      p.thumbnail || 
                      p.linkImage;
            
            if (!img) {
              const contentToSearch = p.content || p.originalContent || p.description || p.summary || "";
              const imgMatches = Array.from(contentToSearch.matchAll(/<img[^>]+(?:src|data-src|srcset)=["']([^"'\s>]+)["']/gi));
              if (imgMatches.length > 0) {
                const likelyImg = imgMatches.find(m => !m[1].includes('icon') && !m[1].includes('logo')) || imgMatches[0];
                img = likelyImg[1];
              }
            }

            if (img && typeof img === 'string') {
              if (img.startsWith('//')) img = `https:${img}`;
              else if (img.startsWith('/')) img = `https://static.fireant.vn${img}`;
            }
            return img;
          };

          let image = extractImage(post) || getFallbackImage(postId);
          
          // Use content from JSON or fallback to summary
          let contentText = post.content || post.originalContent || summary || title;

          // If content is empty in JSON, try scraping from HTML using various common containers
          if (!post.content || post.content.length < 100) {
            // Try the user's specific path structure or common article containers
            const contentMatches = [
              html.match(/<div id="post_content"[^>]*>([\s\S]*?)<\/div>\s*<div/),
              html.match(/<article[^>]*>([\s\S]*?)<\/article>/),
              html.match(/<div[^>]+class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>/),
              html.match(/<main[^>]*>([\s\S]*?)<\/main>/)
            ];

            for (const match of contentMatches) {
              if (match && match[1] && match[1].length > 100) {
                contentText = match[1];
                break;
              }
            }

            // Fix relative images in content
            contentText = contentText.replace(/<img[^>]+(?:src|data-src|srcset)=["']([^"'\s>]+)["']/gi, (match, src) => {
              let absoluteSrc = src;
              if (src.startsWith('//')) {
                absoluteSrc = `https:${src}`;
              } else if (src.startsWith('/')) {
                absoluteSrc = `https://static.fireant.vn${src}`;
              }
              
              // Ensure we use the best available source attribute
              if (match.includes('data-src=')) {
                return match.replace(/data-src=["'][^"']+["']/i, `src="${absoluteSrc}"`);
              } else if (!match.includes('src=')) {
                return match.replace('<img', `<img src="${absoluteSrc}"`);
              } else {
                return match.replace(/src=["'][^"']+["']/i, `src="${absoluteSrc}"`);
              }
            });
          }

          // Collect all images from the images array or extract from content
          const allImages = (post.images || []).map((img: any) => {
            let url = img.imageUrl || (img.imageID ? `https://static.fireant.vn/News/Image/${img.imageID}` : null);
            if (url && typeof url === 'string') {
              if (url.startsWith('//')) url = `https:${url}`;
              else if (url.startsWith('/')) url = `https://static.fireant.vn${url}`;
            }
            return url;
          }).filter(Boolean);

          // If images array is empty or small, extract from fixed contentText
          if (allImages.length <= 1) {
            const contentImgMatches = Array.from(contentText.matchAll(/<img[^>]+src=["']([^"'\s>]+)["']/gi));
            contentImgMatches.forEach(m => {
              if (m[1] && !allImages.includes(m[1]) && !m[1].includes('icon') && !m[1].includes('logo')) {
                allImages.push(m[1]);
              }
            });
          }

          // Refine cover image if it's currently a fallback
          if (image === getFallbackImage(postId) && allImages.length > 0) {
            image = allImages[0];
          }

          if (image && !allImages.includes(image)) {
            allImages.unshift(image);
          }

          return res.json({
            id: post.postID?.toString(),
            source: post.postSource?.name || post.user?.name || 'Fireant',
            sourceUrl: post.postSource?.url || null,
            title: title,
            summary: summary,
            content: contentText,
            author: post.user?.name || 'Fireant',
            image: image,
            images: allImages,
            date: post.date,
            url: `https://fireant.vn/bai-viet/${post.postID}`,
            originalUrl: post.postSourceUrl || post.link || null,
            category: post.postGroup?.name || 'Thị trường'
          });
        }
      }

      // Final Fallback: If not in NEXT_DATA, try to find in cache or return 404
      if (newsCache) {
        const cachedPost = newsCache.find((p: any) => p.id === postId);
        if (cachedPost) return res.json(cachedPost);
      }
      
      res.status(404).json({ error: "Post content not found" });
    } catch (error: any) {
      console.error(`Error fetching full content for ${postId}:`, error.message);
      res.status(500).json({ error: "Failed to fetch post content" });
    }
  });

  // API Proxy for News (Legacy/Specific)
  app.get("/api/news", async (req, res) => {
    const now = Date.now();
    
    // If we have cache (even old), serve it instantly
    if (newsCache) {
      // Trigger background refresh if old
      if (now - lastCacheUpdate > CACHE_TTL && !isRefreshingNews) {
        refreshNews();
      }
      return res.json(newsCache);
    }

    // No cache at all: trigger refresh and return empty immediately to avoid timeout
    if (!isRefreshingNews) {
      refreshNews();
    }
    
    return res.json([]);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
